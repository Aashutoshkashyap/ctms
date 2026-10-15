import { NextResponse } from 'next/server';
import { authorizeOrganizationStorageRequest, googleSharedDriveCapability, organizationStorageView, resolveProjectOrganizationStorage } from '../../../../lib/server/organizationStorage';

export const dynamic = 'force-dynamic';

const CURRENT_GOOGLE_SCOPES = [
  'openid', 'email', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets',
];

/** Read-only management status. OAuth connection/Shared Drive selection remains deliberately deferred until scoped consent is approved. */
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  if (!projectId) return NextResponse.json({ ok: false, message: 'Project is required.' }, { status: 400 });
  const authorization = await authorizeOrganizationStorageRequest(request, projectId);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });
  try {
    const resolution = await resolveProjectOrganizationStorage(authorization.admin, authorization.project.id, authorization.project.organizationId);
    return NextResponse.json({ ok: true, storage: organizationStorageView(resolution), sharedDrive: googleSharedDriveCapability(CURRENT_GOOGLE_SCOPES) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, message: 'Storage status could not be read.' }, { status: 503 });
  }
}
