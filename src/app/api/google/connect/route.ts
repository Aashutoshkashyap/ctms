import { NextResponse } from 'next/server';
import { buildGoogleAuthUrl, getGoogleWorkspaceConfig } from '../../../../lib/server/googleWorkspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = getGoogleWorkspaceConfig(request);
  if (!config) {
    return NextResponse.json({
      ok: false,
      message: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable tenant-owned Drive storage.',
    }, { status: 503 });
  }
  const url = new URL(request.url);
  const state = Buffer.from(JSON.stringify({
    organizationName: url.searchParams.get('organizationName') || 'BuildTrack Tenant',
    projectName: url.searchParams.get('projectName') || 'Default Project',
    projectId: url.searchParams.get('projectId') || '',
    returnTo: url.searchParams.get('returnTo') || '/',
  })).toString('base64url');
  return NextResponse.redirect(buildGoogleAuthUrl(config, state));
}
