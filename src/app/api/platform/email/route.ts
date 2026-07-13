import { NextResponse } from 'next/server';
import { authorizePlatformOwner } from '../../../../lib/server/platformAdmin';
import {
  buildPlatformEmailAuthUrl,
  decryptGoogleRefreshToken,
  getGoogleSecuritySecret,
  getGoogleWorkspaceConfig,
  revokeGoogleToken,
  signGoogleOAuthState,
} from '../../../../lib/server/googleWorkspace';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const config = getGoogleWorkspaceConfig(request);
  const secured = Boolean(getGoogleSecuritySecret());
  const { data: connection } = await authorization.admin
    .from('platform_email_connections')
    .select('google_email,status,last_sent_at,updated_at')
    .eq('id', 'platform-gmail')
    .maybeSingle();
  return NextResponse.json({
    configured: Boolean(config && secured),
    connected: connection?.status === 'connected',
    senderEmail: connection?.google_email || null,
    lastSentAt: connection?.last_sent_at || null,
    updatedAt: connection?.updated_at || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `platform-email-connect:${ip}`, limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const config = getGoogleWorkspaceConfig(request);
  if (!config || !getGoogleSecuritySecret()) {
    return NextResponse.json({ error: 'Google OAuth and encrypted token storage must be configured.' }, { status: 503 });
  }
  const now = Date.now();
  const state = await signGoogleOAuthState({
    purpose: 'platform_email',
    userId: authorization.actorId,
    nonce: crypto.randomUUID(),
    issuedAt: now,
    expiresAt: now + 10 * 60_000,
  });
  return NextResponse.json({ ok: true, url: buildPlatformEmailAuthUrl(config, state) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const { data: connection } = await authorization.admin
    .from('platform_email_connections')
    .select('encrypted_refresh_token')
    .eq('id', 'platform-gmail')
    .maybeSingle();
  if (connection?.encrypted_refresh_token) {
    try {
      await revokeGoogleToken(await decryptGoogleRefreshToken(connection.encrypted_refresh_token));
    } catch {
      // The local record is still revoked if Google has already invalidated it.
    }
  }
  await authorization.admin.from('platform_email_connections').update({
    status: 'revoked',
    encrypted_refresh_token: null,
    updated_at: new Date().toISOString(),
  }).eq('id', 'platform-gmail');
  return NextResponse.json({ ok: true });
}
