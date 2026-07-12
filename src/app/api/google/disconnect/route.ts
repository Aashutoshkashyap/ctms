import { NextResponse } from 'next/server';
import { authorizeGoogleRequest, readGoogleConnection } from '../../../../lib/server/googleConnection';
import { decryptGoogleRefreshToken, revokeGoogleToken } from '../../../../lib/server/googleWorkspace';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

const LEGACY_GOOGLE_COOKIES = [
  'bt_google_refresh_token', 'bt_google_project_folder', 'bt_google_daily_folder', 'bt_google_expense_folder',
  'bt_google_employee_folder', 'bt_google_document_folder', 'bt_google_photo_folder', 'bt_google_sheet_id', 'bt_google_root_folder',
];

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `google-disconnect:${ip}`, limit: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.json().catch(() => null) as { projectId?: string } | null;
  const projectId = body?.projectId?.trim();
  if (!projectId) return NextResponse.json({ ok: false, message: 'Project is required.' }, { status: 400 });
  const authorization = await authorizeGoogleRequest(request, projectId, ['project_director']);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  const connection = await readGoogleConnection(authorization.admin, projectId);
  if (connection?.encrypted_refresh_token) {
    const refreshToken = await decryptGoogleRefreshToken(connection.encrypted_refresh_token).catch(() => '');
    if (refreshToken) await revokeGoogleToken(refreshToken);
  }
  await authorization.admin.from('google_connections').delete().eq('project_id', projectId);
  const response = NextResponse.json({ ok: true, message: 'Tenant Google Drive connection removed.' });
  const secure = new URL(request.url).protocol === 'https:';
  LEGACY_GOOGLE_COOKIES.forEach(name => response.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 }));
  return response;
}
