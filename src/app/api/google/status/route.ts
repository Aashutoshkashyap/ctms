import { NextResponse } from 'next/server';
import { getGoogleWorkspaceConfig } from '../../../../lib/server/googleWorkspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = getGoogleWorkspaceConfig(request);
  const cookie = (name: string) => request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
  return NextResponse.json({
    configured: Boolean(config),
    connected: Boolean(cookie('bt_google_refresh_token') && cookie('bt_google_project_folder')),
    project_folder_id: cookie('bt_google_project_folder') || null,
    sheet_id: cookie('bt_google_sheet_id') || null,
    missing: config ? [] : ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  });
}
