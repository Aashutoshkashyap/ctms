import { NextResponse } from 'next/server';
import { prepareSafeBoqImport } from '../../../../lib/boqImport';
import { authorizeProjectRequest } from '../../../../lib/server/projectAuthorization';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

/** Server-authorized, merge-only BOQ persistence. There is deliberately no delete path. */
export async function POST(request: Request) {
  const limit = rateLimit({ key: `boq-import:${getClientIp(request)}`, limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.json().catch(() => null) as { projectId?: string; wbs?: unknown; activities?: unknown; dependencies?: unknown } | null;
  if (!body?.projectId || !Array.isArray(body.wbs) || !Array.isArray(body.activities) || !Array.isArray(body.dependencies) || body.wbs.length > 2_000 || body.activities.length > 5_000 || body.dependencies.length > 10_000) {
    return NextResponse.json({ ok: false, message: 'A bounded project BOQ import is required.' }, { status: 400 });
  }
  const authorization = await authorizeProjectRequest(request, body.projectId, 'schedule', 'write');
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  if (!['project_director', 'project_manager', 'planning_engineer'].includes(authorization.role)) {
    return NextResponse.json({ ok: false, message: 'Only the project director, project manager, or planning engineer can import BOQ work.' }, { status: 403 });
  }
  const projectId = authorization.project.id;
  try {
    const [wbsResult, activityResult, dependencyResult] = await Promise.all([
      authorization.admin.from('wbs_items').select('*').eq('project_id', projectId),
      authorization.admin.from('activities').select('*').eq('project_id', projectId),
      authorization.admin.from('activity_dependencies').select('*').eq('project_id', projectId),
    ]);
    if (wbsResult.error || activityResult.error || dependencyResult.error) throw new Error((wbsResult.error || activityResult.error || dependencyResult.error)?.message || 'Existing schedule could not be read.');
    const plan = prepareSafeBoqImport({ wbs: wbsResult.data || [], activities: activityResult.data || [], dependencies: dependencyResult.data || [] }, {
      projectId,
      wbs: body.wbs as any[],
      activities: body.activities as any[],
      dependencies: body.dependencies as any[],
    });
    if (!plan.ok) return NextResponse.json(plan, { status: 409 });
    const persisted = [
      await authorization.admin.from('wbs_items').upsert(plan.wbs, { onConflict: 'id' }),
      await authorization.admin.from('activities').upsert(plan.activities.map(({ early_start, early_finish, late_start, late_finish, total_float, free_float, is_critical, is_near_critical, ...activity }) => ({ ...activity, project_id: projectId })), { onConflict: 'id' }),
      await authorization.admin.from('activity_dependencies').upsert(plan.dependencies.map(item => ({ ...item, project_id: projectId })), { onConflict: 'id' }),
    ];
    const failed = persisted.find(item => item.error)?.error;
    if (failed) return NextResponse.json({ ...plan, ok: false, message: `BOQ persistence failed: ${failed.message}` }, { status: 503 });
    return NextResponse.json(plan, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, message: 'BOQ import could not be persisted.' }, { status: 503 });
  }
}
