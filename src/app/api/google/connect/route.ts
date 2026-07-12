import { NextResponse } from 'next/server';
import { authorizeGoogleRequest } from '../../../../lib/server/googleConnection';
import {
  buildGoogleAuthUrl,
  getGoogleSecuritySecret,
  getGoogleWorkspaceConfig,
  signGoogleOAuthState,
} from '../../../../lib/server/googleWorkspace';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `google-connect:${ip}`, limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const config = getGoogleWorkspaceConfig(request);
  if (!config || !getGoogleSecuritySecret()) {
    return NextResponse.json({
      ok: false,
      message: 'Google OAuth or encrypted token storage is not configured on the server.',
    }, { status: 503 });
  }
  const body = await request.json().catch(() => null) as { projectId?: string } | null;
  const projectId = body?.projectId?.trim();
  if (!projectId) return NextResponse.json({ ok: false, message: 'Project is required.' }, { status: 400 });

  const authorization = await authorizeGoogleRequest(request, projectId, ['project_director']);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  const now = Date.now();
  const state = await signGoogleOAuthState({
    projectId: authorization.project.id,
    organizationId: authorization.project.organizationId,
    userId: authorization.userId,
    nonce: crypto.randomUUID(),
    issuedAt: now,
    expiresAt: now + 10 * 60_000,
  });
  return NextResponse.json({ ok: true, url: buildGoogleAuthUrl(config, state) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  return NextResponse.json({ ok: false, message: 'Start Google Drive connection from the authenticated project settings screen.' }, { status: 405 });
}
