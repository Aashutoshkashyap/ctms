import { authorizeProjectRequest } from '../../../lib/server/projectAuthorization';
import { canTransition, revisedCompletionDate, type CommercialStatus, type CommercialType } from '../../../lib/commercialLifecycle';
import { roundMoney } from '../../../lib/financialMetrics';

export const dynamic = 'force-dynamic';
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const types = new Set<CommercialType>(['variation', 'claim_cost', 'claim_eot']);
const statuses = new Set<CommercialStatus>(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn']);
const authorRoles = new Set(['project_director', 'project_manager', 'qs_billing_engineer']);

function invalid(message: string) { return Response.json({ error: message }, { status: 400 }); }
async function history(actor: any, projectId: string, recordId: string, action: string, remarks?: string) {
  return actor.admin.from('commercial_action_history').insert({ organization_id: actor.project.organizationId, project_id: projectId, commercial_record_id: recordId, action, remarks: remarks || null, actor_id: actor.userId });
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const actor = await authorizeProjectRequest(request, projectId, 'claims', 'read');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const [records, activities] = await Promise.all([
    actor.admin.from('variations_and_claims').select('*').eq('organization_id', actor.project.organizationId).eq('project_id', projectId).order('created_at', { ascending: false }),
    actor.admin.from('activities').select('id,wbs_code,name,planned_quantity,unit').eq('project_id', projectId),
  ]);
  if (records.error || activities.error) return invalid('Commercial records could not be loaded.');
  const ids = (records.data || []).map((record: any) => record.id);
  const actions = ids.length ? await actor.admin.from('commercial_action_history').select('*').eq('organization_id', actor.project.organizationId).in('commercial_record_id', ids).order('created_at') : { data: [], error: null };
  if (actions.error) return invalid('Commercial history could not be loaded.');
  return Response.json({ records: records.data || [], history: actions.data || [], activities: activities.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = text(body?.projectId);
  const actor = await authorizeProjectRequest(request, projectId, 'claims', 'write');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  if (!authorRoles.has(actor.role)) return Response.json({ error: 'Your project role cannot create commercial records.' }, { status: 403 });
  if (body?.action === 'create') return create(actor, projectId, body);
  if (body?.action === 'update') return update(actor, projectId, body);
  return invalid('Unsupported commercial action.');
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = text(body?.projectId); const id = text(body?.recordId); const action = text(body?.action) as CommercialStatus;
  const actor = await authorizeProjectRequest(request, projectId, 'claims', 'write');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const loaded = await actor.admin.from('variations_and_claims').select('*').eq('id', id).eq('organization_id', actor.project.organizationId).eq('project_id', projectId).maybeSingle();
  if (!loaded.data) return Response.json({ error: 'Commercial record was not found.' }, { status: 404 });
  const record = loaded.data; const from = (record.workflow_status || 'draft') as CommercialStatus;
  if (!statuses.has(action) || !canTransition(from, action)) return Response.json({ error: 'Invalid commercial workflow transition.' }, { status: 409 });
  const directorAction = ['under_review', 'approved', 'rejected'].includes(action);
  if (directorAction && actor.role !== 'project_director') return Response.json({ error: 'Only the Project Director can review or decide this commercial record.' }, { status: 403 });
  if (directorAction && record.created_by === actor.userId) return Response.json({ error: 'The record creator cannot review or decide it.' }, { status: 403 });
  if ((action === 'submitted' || action === 'withdrawn') && record.created_by !== actor.userId && actor.role !== 'project_director') return Response.json({ error: 'Only the creator can submit or withdraw this draft.' }, { status: 403 });
  const now = new Date().toISOString(); const patch: any = { workflow_status: action, updated_at: now };
  if (action === 'submitted') { patch.submitted_by = actor.userId; patch.submitted_at = now; }
  if (action === 'under_review') { patch.reviewed_by = actor.userId; patch.reviewed_at = now; }
  if (action === 'approved' || action === 'rejected') { patch.decided_by = actor.userId; patch.decided_at = now; patch.decision_remarks = text(body?.remarks) || null; }
  if (action === 'approved' && record.type === 'claim_eot') {
    const days = Number(body?.approvedExtensionDays ?? record.time_impact_days);
    if (!Number.isInteger(days) || days < 0) return invalid('Approved EOT days must be a non-negative whole number.');
    const project = await actor.admin.from('projects').select('target_completion_date,original_target_completion_date').eq('id', projectId).eq('organization_id', actor.project.organizationId).single();
    if (!project.data?.target_completion_date) return invalid('Project contractual completion date is unavailable.');
    const original = project.data.original_target_completion_date || project.data.target_completion_date;
    patch.approved_extension_days = days; patch.approved_completion_date = revisedCompletionDate(original, days);
  }
  const saved = await actor.admin.from('variations_and_claims').update(patch).eq('id', id).eq('workflow_status', from).select('*').single();
  if (saved.error || !saved.data) return Response.json({ error: 'Commercial record changed elsewhere. Refresh and retry.' }, { status: 409 });
  if (action === 'approved' && saved.data.type === 'claim_eot') {
    const project = await actor.admin.from('projects').select('target_completion_date,original_target_completion_date').eq('id', projectId).eq('organization_id', actor.project.organizationId).single();
    if (project.data) await actor.admin.from('projects').update({ original_target_completion_date: project.data.original_target_completion_date || project.data.target_completion_date, approved_target_completion_date: saved.data.approved_completion_date }).eq('id', projectId).eq('organization_id', actor.project.organizationId);
  }
  await history(actor, projectId, id, action, text(body?.remarks));
  return Response.json({ record: saved.data });
}

async function create(actor: any, projectId: string, body: Record<string, unknown>) {
  const type = text(body.type) as CommercialType; const reference = text(body.referenceId); const title = text(body.title);
  if (!types.has(type) || !reference || !title) return invalid('Type, reference and title are required.');
  const activityId = text(body.affectedActivityId) || null;
  if (activityId) { const activity = await actor.admin.from('activities').select('id').eq('id', activityId).eq('project_id', projectId).maybeSingle(); if (!activity.data) return invalid('Affected BOQ item must belong to this project.'); }
  const data = { organization_id: actor.project.organizationId, project_id: projectId, type, reference_id: reference, title, description: text(body.description) || null, reason_basis: text(body.reasonBasis) || null, event_date: text(body.eventDate) || null, notice_date: text(body.noticeDate) || null, time_impact_days: Number(body.requestedDays || 0), cost_impact_amount: Number(body.costImpact || 0), affected_activity_id: activityId, proposed_quantity: body.proposedQuantity === '' ? null : Number(body.proposedQuantity || 0), proposed_rate: body.proposedRate === '' ? null : Number(body.proposedRate || 0), requested_completion_date: text(body.requestedCompletionDate) || null, workflow_status: 'draft', created_by: actor.userId };
  if (![data.time_impact_days, data.cost_impact_amount, data.proposed_quantity ?? 0, data.proposed_rate ?? 0].every(value => Number.isFinite(value) && value >= 0)) return invalid('Commercial quantities and values must be finite non-negative numbers.');
  data.cost_impact_amount = roundMoney(data.cost_impact_amount); data.proposed_quantity = data.proposed_quantity === null ? null : roundMoney(data.proposed_quantity); data.proposed_rate = data.proposed_rate === null ? null : roundMoney(data.proposed_rate);
  const saved = await actor.admin.from('variations_and_claims').insert(data).select('*').single();
  if (saved.error) return invalid(saved.error.code === '23505' ? 'Reference already exists for this commercial record.' : 'Commercial record could not be created.');
  await history(actor, projectId, saved.data.id, 'created'); return Response.json({ record: saved.data }, { status: 201 });
}

async function update(actor: any, projectId: string, body: Record<string, unknown>) {
  const id = text(body.recordId); const loaded = await actor.admin.from('variations_and_claims').select('*').eq('id', id).eq('organization_id', actor.project.organizationId).eq('project_id', projectId).maybeSingle();
  if (!loaded.data) return Response.json({ error: 'Commercial record was not found.' }, { status: 404 });
  if (loaded.data.workflow_status !== 'draft') return Response.json({ error: 'Only draft commercial records can be edited.' }, { status: 409 });
  if (loaded.data.created_by !== actor.userId && actor.role !== 'project_director') return Response.json({ error: 'Only the creator can edit this draft.' }, { status: 403 });
  const timeImpactDays = Number(body.requestedDays || 0); const costImpact = Number(body.costImpact || 0); const proposedQuantity = Number(body.proposedQuantity || 0); const proposedRate = Number(body.proposedRate || 0);
  if (![timeImpactDays, costImpact, proposedQuantity, proposedRate].every(value => Number.isFinite(value) && value >= 0)) return invalid('Commercial quantities and values must be finite non-negative numbers.');
  const patch = { title: text(body.title) || loaded.data.title, description: text(body.description) || null, reason_basis: text(body.reasonBasis) || null, time_impact_days: timeImpactDays, cost_impact_amount: roundMoney(costImpact), proposed_quantity: roundMoney(proposedQuantity), proposed_rate: roundMoney(proposedRate), requested_completion_date: text(body.requestedCompletionDate) || null, updated_at: new Date().toISOString() };
  const saved = await actor.admin.from('variations_and_claims').update(patch).eq('id', id).eq('workflow_status', 'draft').select('*').single();
  if (saved.error) return invalid('Commercial draft could not be updated.'); await history(actor, projectId, id, 'updated'); return Response.json({ record: saved.data });
}
