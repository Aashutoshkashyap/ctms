import { NextResponse } from 'next/server';
import { authorizeOpenWaManagement, openWaHealthView, readOpenWaConfiguration, safeOpenWaConfigurationInput } from '../../../../lib/server/openwaProvider';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  if (!projectId) return NextResponse.json({ ok: false, message: 'Project is required.' }, { status: 400 });
  const authorization = await authorizeOpenWaManagement(request, projectId);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  try {
    return NextResponse.json({ ok: true, health: openWaHealthView(await readOpenWaConfiguration(authorization.admin, authorization.project.organizationId)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ ok: false, message: 'OpenWA status is unavailable.' }, { status: 503 }); }
}

/** Browser users may prepare or disable configuration, but never enable a transport or submit a secret. */
export async function POST(request: Request) {
  const limit = rateLimit({ key: `openwa-config:${getClientIp(request)}`, limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.json().catch(() => null) as { projectId?: string; state?: string; endpointBaseUrl?: string; webhookSecretRef?: string } | null;
  if (!body?.projectId) return NextResponse.json({ ok: false, message: 'Project is required.' }, { status: 400 });
  const authorization = await authorizeOpenWaManagement(request, body.projectId);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  const input = safeOpenWaConfigurationInput(body);
  if (!input) return NextResponse.json({ ok: false, message: 'Only DISABLED or complete CONFIGURED state is accepted. Secrets are set server-side.' }, { status: 400 });
  try {
    const now = new Date().toISOString();
    const { error } = await authorization.admin.from('openwa_provider_configurations').upsert({
      id: `openwa-${authorization.project.organizationId}`, organization_id: authorization.project.organizationId, provider: 'OPENWA',
      ...input, configured_by: authorization.userId, updated_at: now,
    }, { onConflict: 'organization_id,provider' });
    if (error) throw error;
    return NextResponse.json({ ok: true, state: input.state, message: input.state === 'CONFIGURED' ? 'OpenWA is configured but remains disabled.' : 'OpenWA is disabled.' });
  } catch { return NextResponse.json({ ok: false, message: 'OpenWA configuration could not be saved. Apply the provider migration first.' }, { status: 503 }); }
}
