-- Phase 1G: additive optimistic concurrency for daily reports only.
-- Run supabase_phase1g_concurrency_preflight.sql first and apply manually.
begin;

alter table daily_reports add column if not exists revision integer not null default 1;
alter table daily_reports drop constraint if exists phase1g_daily_reports_revision_positive;
alter table daily_reports add constraint phase1g_daily_reports_revision_positive check (revision >= 1) not valid;

create or replace function private.phase1g_daily_report_write_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Conditional updates run through the server service role after the shared
  -- project authorization gate. Browser writes would otherwise bypass the
  -- expected-revision comparison even though RLS permits daily reporting.
  if auth.role() <> 'service_role' then
    raise exception 'Daily reports must be saved through the conditional update command' using errcode='42501';
  end if;
  if tg_op='INSERT' and new.revision <> 1 then
    raise exception 'New daily reports must begin at revision 1' using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.revision <> old.revision + 1 then
    raise exception 'Daily report revisions must advance by one' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists phase1g_daily_report_write_guard on daily_reports;
create trigger phase1g_daily_report_write_guard before insert or update on daily_reports
for each row execute function private.phase1g_daily_report_write_guard();

create table if not exists project_update_operations (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_key text not null,
  target_type text not null check (target_type in ('DAILY_REPORT')),
  target_id text not null,
  expected_revision integer not null check (expected_revision >= 0),
  outcome_code text not null default 'PENDING' check (outcome_code in ('PENDING','UPDATED','NOT_FOUND','CONFLICT','VALIDATION_ERROR','PERSISTENCE_ERROR')),
  resulting_revision integer,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, operation_key)
);
create index if not exists idx_project_update_operations_project on project_update_operations(organization_id, project_id, created_at desc);
alter table project_update_operations enable row level security;

create or replace function private.phase1g_apply_daily_report_update(
  p_organization_id text, p_project_id text, p_actor_id uuid, p_operation_key text,
  p_expected_revision integer, p_report jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_org text; existing_op project_update_operations%rowtype; current_report daily_reports%rowtype; saved daily_reports%rowtype; response jsonb;
begin
  select organization_id into current_org from projects where id=p_project_id;
  if current_org is null or current_org <> p_organization_id then return jsonb_build_object('code','NOT_FOUND','message','The project is unavailable.'); end if;
  if p_operation_key is null or length(p_operation_key)=0 or length(p_operation_key)>200 or p_expected_revision < 0 then return jsonb_build_object('code','VALIDATION_ERROR','message','The update request is invalid.'); end if;
  select * into existing_op from project_update_operations where organization_id=p_organization_id and operation_key=p_operation_key for update;
  if found then
    if existing_op.actor_id <> p_actor_id or existing_op.project_id <> p_project_id or existing_op.target_id <> coalesce(p_report->>'id','') then return jsonb_build_object('code','CONFLICT','message','This operation key belongs to another update.'); end if;
    if existing_op.outcome_code <> 'PENDING' then return coalesce(existing_op.result, jsonb_build_object('code',existing_op.outcome_code,'message','This update was already processed.','revision',existing_op.resulting_revision)); end if;
  else
    insert into project_update_operations(organization_id,project_id,actor_id,operation_key,target_type,target_id,expected_revision)
    values(p_organization_id,p_project_id,p_actor_id,p_operation_key,'DAILY_REPORT',coalesce(p_report->>'id',''),p_expected_revision);
  end if;
  if p_expected_revision=0 then
    select * into current_report from daily_reports where id=coalesce(p_report->>'id','') and project_id=p_project_id for update;
    if found then
      response:=jsonb_build_object('code','CONFLICT','message','This daily report has already been created.','revision',current_report.revision,'record',to_jsonb(current_report));
    else
      insert into daily_reports(id,project_id,report_date,weather,manpower_total,equipment_total,site_instructions,obstruction_reasons,next_day_plan,submitted_by,submitted_by_email,revision)
      values(coalesce(p_report->>'id',''),p_project_id,(p_report->>'report_date')::date,p_report->>'weather',coalesce((p_report->>'manpower_total')::integer,0),coalesce((p_report->>'equipment_total')::integer,0),p_report->>'site_instructions',p_report->>'obstruction_reasons',p_report->>'next_day_plan',p_report->>'submitted_by',p_report->>'submitted_by_email',1) returning * into saved;
      response:=jsonb_build_object('code','UPDATED','message','Daily report saved.','revision',saved.revision,'record',to_jsonb(saved));
    end if;
  else
    update daily_reports set report_date=(p_report->>'report_date')::date, weather=p_report->>'weather', manpower_total=coalesce((p_report->>'manpower_total')::integer,0), equipment_total=coalesce((p_report->>'equipment_total')::integer,0), site_instructions=p_report->>'site_instructions', obstruction_reasons=p_report->>'obstruction_reasons', next_day_plan=p_report->>'next_day_plan', submitted_by=p_report->>'submitted_by', submitted_by_email=p_report->>'submitted_by_email', revision=revision+1
    where id=coalesce(p_report->>'id','') and project_id=p_project_id and revision=p_expected_revision returning * into saved;
    if found then response:=jsonb_build_object('code','UPDATED','message','Daily report saved.','revision',saved.revision,'record',to_jsonb(saved));
    else
      select * into current_report from daily_reports where id=coalesce(p_report->>'id','') and project_id=p_project_id;
      if found then response:=jsonb_build_object('code','CONFLICT','message','This daily report was updated by another user. Refresh before reconciling your changes.','revision',current_report.revision,'record',to_jsonb(current_report));
      else response:=jsonb_build_object('code','NOT_FOUND','message','The daily report no longer exists.'); end if;
    end if;
  end if;
  update project_update_operations set outcome_code=response->>'code',resulting_revision=nullif(response->>'revision','')::integer,result=response,updated_at=now() where organization_id=p_organization_id and operation_key=p_operation_key;
  return response;
end;
$$;
revoke all on function private.phase1g_apply_daily_report_update(text,text,uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function private.phase1g_apply_daily_report_update(text,text,uuid,text,integer,jsonb) to service_role;
revoke all on function private.phase1g_daily_report_write_guard() from public;
comment on table project_update_operations is 'Phase 1G server idempotency ledger for conditional project record updates; not a browser queue.';
commit;
