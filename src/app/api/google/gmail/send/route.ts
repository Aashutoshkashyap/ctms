import { NextResponse } from 'next/server';
import { getGoogleWorkspaceConfig, refreshAccessToken, sendGmailMessage } from '../../../../../lib/server/googleWorkspace';

export const dynamic = 'force-dynamic';

function cookieValue(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}

export async function POST(request: Request) {
  if (process.env.GOOGLE_ENABLE_GMAIL_SEND !== 'true') {
    return NextResponse.json({
      ok: false,
      message: 'Gmail send is not enabled. Set GOOGLE_ENABLE_GMAIL_SEND=true and complete Google OAuth verification for gmail.send before using this route.',
    }, { status: 403 });
  }

  const config = getGoogleWorkspaceConfig(request);
  if (!config) return NextResponse.json({ ok: false, message: 'Google OAuth is not configured.' }, { status: 503 });
  const refreshToken = cookieValue(request, 'bt_google_refresh_token');
  if (!refreshToken) return NextResponse.json({ ok: false, message: 'Tenant Google account is not connected.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { to?: string; subject?: string; message?: string } | null;
  if (!body?.to || !body?.subject || !body?.message) {
    return NextResponse.json({ ok: false, message: 'to, subject and message are required.' }, { status: 400 });
  }

  const token = await refreshAccessToken(config, refreshToken);
  const sent = await sendGmailMessage(token.access_token, body.to, body.subject, body.message);
  return NextResponse.json({ ok: true, id: sent.id, threadId: sent.threadId });
}
