import { authorizeProjectRequest } from '../../../lib/server/projectAuthorization';
import { csvSafeRows } from '../../../lib/reportSafety';
import { buildProjectReport, parseReportType, validReportDate } from '../../../lib/server/projectReport';

export const dynamic = 'force-dynamic';
const dateFiltered = (rows: any[], field: string, from: string | null, to: string | null) => rows.filter(row => {
  const date = typeof row[field] === 'string' ? row[field] : '';
  return (!from || !date || date >= from) && (!to || !date || date <= to);
});

export async function GET(request: Request) {
  const url = new URL(request.url); const projectId = (url.searchParams.get('projectId') || '').trim(); const type = parseReportType(url.searchParams.get('type'));
  const from = url.searchParams.get('from'); const to = url.searchParams.get('to'); const format = url.searchParams.get('format') || 'json';
  if (!projectId || !type || !['json', 'html', 'csv'].includes(format) || (from && !validReportDate(from)) || (to && !validReportDate(to)) || (from && to && from > to)) return Response.json({ error: 'Valid project, report type, format and date filters are required.' }, { status: 400 });
  const actor = await authorizeProjectRequest(request, projectId, 'reports', 'read');
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const org = actor.project.organizationId;
  const [project, dailyReports, activities, ipcRows, commercialRows, qualityRows, safetyRows, handoverRows, expenseRows] = await Promise.all([
    actor.admin.from('projects').select('id,name,contract_amount').eq('id', projectId).eq('organization_id', org).maybeSingle(),
    actor.admin.from('daily_reports').select('*').eq('organization_id', org).eq('project_id', projectId),
    actor.admin.from('activities').select('*').eq('project_id', projectId),
    actor.admin.from('ipc_submissions').select('*').eq('organization_id', org).eq('project_id', projectId),
    actor.admin.from('variations_and_claims').select('*').eq('organization_id', org).eq('project_id', projectId),
    actor.admin.from('qa_qc_inspections').select('*').eq('organization_id', org).eq('project_id', projectId),
    actor.admin.from('safety_logs').select('*').eq('organization_id', org).eq('project_id', projectId),
    actor.admin.from('handover_checklists').select('*').eq('project_id', projectId),
    actor.admin.from('daily_expenses').select('*').eq('organization_id', org).eq('project_id', projectId),
  ]);
  if (!project.data || [dailyReports, activities, ipcRows, commercialRows, qualityRows, safetyRows, handoverRows, expenseRows].some(result => result.error)) return Response.json({ error: 'The authorized project report could not be loaded.' }, { status: 400 });
  const report = buildProjectReport({ type, project: { ...project.data, organization_id: org, project_id: projectId }, organizationId: org, projectId, generatedAt: new Date().toISOString(), dailyReports: dateFiltered(dailyReports.data || [], 'report_date', from, to), activities: (activities.data || []).map((row: any) => ({ ...row, organization_id: org })), ipcRows: dateFiltered(ipcRows.data || [], 'submitted_date', from, to), commercialRows: dateFiltered(commercialRows.data || [], 'notice_date', from, to), qualityRows: dateFiltered(qualityRows.data || [], 'inspection_date', from, to), safetyRows: dateFiltered(safetyRows.data || [], 'log_date', from, to), handoverRows: dateFiltered((handoverRows.data || []).map((row: any) => ({ ...row, organization_id: org })), 'approved_date', from, to), expenseRows: dateFiltered(expenseRows.data || [], 'expense_date', from, to) });
  if (format === 'html') return new Response(report.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (format === 'csv') return new Response(csvSafeRows(report.rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${type}-report.csv"`, 'Cache-Control': 'no-store' } });
  return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
