import { authorizeProjectRequest } from '../../../lib/server/projectAuthorization';
import { recordWorkflowEvent, resolveWorkflowRecipients } from '../../../lib/server/workflowEvents';

export const dynamic = 'force-dynamic';

const text = (value: unknown, max = 2_000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value: unknown) => Number(value ?? 0);
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const fail = (error: string, status = 400) => Response.json({ error }, { status });

function reportInput(value: unknown) {
  const row = value as Record<string, unknown>;
  const manpowerTotal = number(row?.manpower_total);
  const equipmentTotal = number(row?.equipment_total);
  if (!row || !text(row.id, 160) || !validDate(row.report_date) || ![manpowerTotal, equipmentTotal].every(Number.isFinite) || manpowerTotal < 0 || equipmentTotal < 0) return null;
  return {
    id: text(row.id, 160), report_date: text(row.report_date, 10), weather: text(row.weather), manpower_total: manpowerTotal,
    equipment_total: equipmentTotal, site_instructions: text(row.site_instructions), obstruction_reasons: text(row.obstruction_reasons), next_day_plan: text(row.next_day_plan),
  };
}

function workItemsInput(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows = value.map((row, index) => {
    const item = row as Record<string, unknown>;
    const quantity = number(item?.quantity_completed);
    const rework = number(item?.rework_quantity);
    const manpower = number(item?.manpower_count);
    const equipment = number(item?.equipment_count);
    if (!text(item?.activity_id, 160) || ![quantity, rework, manpower, equipment].every(Number.isFinite) || quantity < 0 || rework < 0 || manpower < 0 || equipment < 0) return null;
    return { index, activity_id: text(item.activity_id, 160), quantity_completed: quantity, rework_quantity: rework, manpower_count: manpower, equipment_count: equipment, delay_reason: text(item.delay_reason) };
  });
  return rows.some(row => !row) ? null : rows as NonNullable<typeof rows[number]>[];
}

function materialItemsInput(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows = value.map((row, index) => {
    const item = row as Record<string, unknown>;
    const received = number(item?.received_qty);
    const consumed = number(item?.consumed_qty);
    if (!text(item?.material_name) || !text(item?.unit, 40) || ![received, consumed].every(Number.isFinite) || received < 0 || consumed < 0) return null;
    return { index, material_name: text(item.material_name), unit: text(item.unit, 40), received_qty: received, consumed_qty: consumed, vendor: text(item.vendor) || null };
  });
  return rows.some(row => !row) ? null : rows as NonNullable<typeof rows[number]>[];
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = text(body?.projectId, 160);
  const operationId = text(body?.operationId, 200);
  const actor = await authorizeProjectRequest(request, projectId, 'daily_reports', 'write');
  if ('error' in actor) return fail(actor.error, actor.status);

  const report = reportInput(body?.report);
  const workItems = workItemsInput(body?.workItems);
  const materialItems = materialItemsInput(body?.materialItems);
  if (!operationId || !report || !workItems || !materialItems) return fail('Valid project-scoped daily work values are required.');

  const [{ data: current, error: currentError }, { data: person, error: personError }] = await Promise.all([
    actor.admin.from('daily_reports').select('id,submitted_at,submitted_by_email').eq('id', report.id).eq('project_id', projectId).maybeSingle(),
    actor.admin.from('project_users').select('name,email').eq('project_id', projectId).eq('auth_user_id', actor.userId).maybeSingle(),
  ]);
  if (currentError || personError || !person?.email) return fail('Daily work could not be authorized.', 403);
  const isFieldReporter = ['field_employee', 'subcontractor'].includes(actor.role);
  if (isFieldReporter && current?.submitted_by_email && current.submitted_by_email.toLowerCase() !== person.email.toLowerCase()) return fail('You may only update your own daily reports.', 403);

  const activityIds = [...new Set(workItems.map(item => item.activity_id))];
  if (activityIds.length) {
    const { data: activities, error } = await actor.admin.from('activities').select('id').eq('project_id', projectId).in('id', activityIds);
    if (error || (activities || []).length !== activityIds.length) return fail('Each work item must reference an activity in this project.');
  }

  const reportRow = {
    ...report, project_id: projectId, submitted_by: current ? undefined : (person.name || person.email), submitted_by_email: current ? undefined : person.email,
    submitted_at: current?.submitted_at || new Date().toISOString(),
  };
  const savedReport = current
    ? await actor.admin.from('daily_reports').update(reportRow).eq('id', report.id).eq('project_id', projectId).select('*').single()
    : await actor.admin.from('daily_reports').insert(reportRow).select('*').single();
  if (savedReport.error || !savedReport.data) return fail(savedReport.error?.code === '23505' ? 'A daily report already exists for this project date.' : 'Daily report could not be saved.');

  const workRows = workItems.map(item => ({ ...item, id: `daily-work-${report.id}-${item.index + 1}`, index: undefined, project_id: projectId, daily_report_id: report.id }));
  const materialRows = materialItems.map(item => ({ ...item, id: `daily-material-${report.id}-${item.index + 1}`, index: undefined, project_id: projectId, daily_report_id: report.id }));
  if (workRows.length) {
    const { error } = await actor.admin.from('daily_work_items').upsert(workRows, { onConflict: 'id' });
    if (error) return fail('Daily work items could not be saved.');
  }
  if (materialRows.length) {
    const { error } = await actor.admin.from('material_logs').upsert(materialRows, { onConflict: 'id' });
    if (error) return fail('Daily material records could not be saved.');
  }

  // Creation is the existing daily-report submission boundary. Later edits do
  // not create a new workflow transition or a second notification.
  if (!current) {
    const event = {
      organizationId: actor.project.organizationId, projectId, departmentKey: 'site', eventType: 'PROJECT_SITE_WORK_REPORTED',
      sourceType: 'daily_report', sourceId: report.id, actorUserId: actor.userId,
      dedupeKey: `project:${projectId}:daily-report:${report.id}:submitted`,
      metadata: { title: `Daily site work submitted for ${report.report_date}`, reportDate: report.report_date },
    };
    const recipients = await resolveWorkflowRecipients(actor.admin, event);
    await recordWorkflowEvent(actor.admin, event, recipients);
  }
  return Response.json({ report: savedReport.data, created: !current });
}
