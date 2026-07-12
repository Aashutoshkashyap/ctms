import { NextResponse } from 'next/server';
import { authorizeGoogleRequest, readGoogleConnection } from '../../../../../lib/server/googleConnection';
import { decryptGoogleRefreshToken, getGoogleWorkspaceConfig, refreshAccessToken, sendGmailMessage } from '../../../../../lib/server/googleWorkspace';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../../lib/server/security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `google-gmail:${ip}`, limit: 20, windowMs: 60 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  if (process.env.GOOGLE_ENABLE_GMAIL_SEND !== 'true') {
    return NextResponse.json({
      ok: false,
      message: 'Gmail send is not enabled. Complete Google verification for gmail.send before enabling it.',
    }, { status: 403 });
  }

  const config = getGoogleWorkspaceConfig(request);
  if (!config) return NextResponse.json({ ok: false, message: 'Google OAuth is not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null) as { projectId?: string; to?: string; subject?: string; message?: string } | null;
  const projectId = body?.projectId?.trim() || '';
  const to = body?.to?.trim() || '';
  const subject = body?.subject?.trim() || '';
  const message = body?.message?.trim() || '';
  if (!projectId || !/^\S+@\S+\.\S+$/.test(to) || !subject || !message) {
    return NextResponse.json({ ok: false, message: 'Project, valid recipient, subject and message are required.' }, { status: 400 });
  }
  if (subject.length > 200 || message.length > 20_000) return NextResponse.json({ ok: false, message: 'Email content is too long.' }, { status: 413 });
  const authorization = await authorizeGoogleRequest(request, projectId, ['project_director', 'project_manager']);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  const connection = await readGoogleConnection(authorization.admin, projectId);
  if (!connection?.encrypted_refresh_token) return NextResponse.json({ ok: false, message: 'The Project Director has not connected Google Workspace.' }, { status: 409 });
  try {
    const refreshToken = await decryptGoogleRefreshToken(connection.encrypted_refresh_token);
    const token = await refreshAccessToken(config, refreshToken);
    const sent = await sendGmailMessage(token.access_token, to, subject, message);
    return NextResponse.json({ ok: true, id: sent.id, threadId: sent.threadId });
  } catch (error) {
    console.error('Gmail send failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ ok: false, message: 'Gmail delivery failed. Reconnect Google Workspace and try again.' }, { status: 502 });
  }
}
