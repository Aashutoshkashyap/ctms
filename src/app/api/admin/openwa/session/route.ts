import { NextResponse } from 'next/server';
import { authorizeOpenWaManagement } from '../../../../../lib/server/openwaProvider';
import { readManagedOpenWaSession, startManagedOpenWaPairing } from '../../../../../lib/server/openwaGateway';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../../lib/server/security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  if (!projectId) return NextResponse.json({ ok: false, message: 'Project is required.' }, { status: 400 });
  const authorization = await authorizeOpenWaManagement(request, projectId);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  return NextResponse.json({ ok: true, session: await readManagedOpenWaSession() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const limit = rateLimit({ key: `openwa-pairing:${getClientIp(request)}`, limit: 5, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.json().catch(() => null) as { projectId?: string; action?: string } | null;
  if (!body?.projectId || body.action !== 'start_pairing') return NextResponse.json({ ok: false, message: 'A valid pairing request is required.' }, { status: 400 });
  const authorization = await authorizeOpenWaManagement(request, body.projectId);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  const session = await startManagedOpenWaPairing();
  return NextResponse.json({ ok: session.status !== 'ERROR', session }, { headers: { 'Cache-Control': 'no-store' }, status: session.status === 'ERROR' ? 503 : 200 });
}
