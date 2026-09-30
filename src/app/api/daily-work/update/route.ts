import { authorizeProjectRequest } from '../../../../lib/server/projectAuthorization';
import { conditionallyUpdateDailyReport, normalizeDailyReportPatch, type DailyReportUpdateOutcome } from '../../../../lib/server/dailyReportConcurrency';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { projectId?: string; operationId?: string; expectedRevision?: number; report?: unknown } | null;
  const projectId = body?.projectId?.trim() || '';
  const report = normalizeDailyReportPatch(body?.report);
  if (!projectId || !report) return Response.json({ code: 'VALIDATION_ERROR', message: 'Project and valid daily-report details are required.' }, { status: 400 });
  const authorization = await authorizeProjectRequest(request, projectId, 'daily_reports', 'write');
  if ('error' in authorization) return Response.json({ code: authorization.status === 401 ? 'UNAUTHORIZED' : 'NOT_FOUND', message: authorization.error }, { status: authorization.status });
  const outcome = await conditionallyUpdateDailyReport({
    organizationId: authorization.project.organizationId, projectId: authorization.project.id, actorId: authorization.userId,
    operationId: body?.operationId || '', expectedRevision: Number(body?.expectedRevision), report,
  }, {
    apply: async input => {
      const { data, error } = await authorization.admin.rpc('phase1g_apply_daily_report_update', {
        p_organization_id: input.organizationId, p_project_id: input.projectId, p_actor_id: input.actorId,
        p_operation_key: input.operationId, p_expected_revision: input.expectedRevision, p_report: input.report,
      });
      if (error || !data) return { code: 'PERSISTENCE_ERROR', message: 'The daily report could not be saved to the project database.' };
      return data as DailyReportUpdateOutcome;
    },
  });
  const status = outcome.code === 'UPDATED' ? 200 : outcome.code === 'CONFLICT' ? 409 : outcome.code === 'NOT_FOUND' ? 404 : outcome.code === 'UNAUTHORIZED' ? 403 : outcome.code === 'VALIDATION_ERROR' ? 400 : 503;
  return Response.json(outcome, { status, headers: { 'Cache-Control': 'no-store' } });
}
