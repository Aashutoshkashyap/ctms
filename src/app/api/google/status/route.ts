import { NextResponse } from 'next/server';
import { authorizeGoogleRequest, readGoogleConnection } from '../../../../lib/server/googleConnection';
import { getGoogleSecuritySecret, getGoogleWorkspaceConfig } from '../../../../lib/server/googleWorkspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = getGoogleWorkspaceConfig(request);
  const secured = Boolean(getGoogleSecuritySecret());
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  if (!config || !secured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      missing: [
        ...(!config ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] : []),
        ...(!secured ? ['GOOGLE_TOKEN_ENCRYPTION_KEY'] : []),
      ],
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!projectId) return NextResponse.json({ configured: true, connected: false, message: 'Project is required.' }, { status: 400 });
  const authorization = await authorizeGoogleRequest(request, projectId, [
    'project_director', 'business_admin', 'project_manager', 'planning_engineer', 'site_engineer', 'field_employee',
    'qa_qc_engineer', 'safety_officer', 'qs_billing_engineer', 'accountant', 'store_officer',
    'design_coordinator', 'subcontractor',
  ]);
  if ('error' in authorization) return NextResponse.json({ configured: true, connected: false, message: authorization.error }, { status: authorization.status });
  const connection = await readGoogleConnection(authorization.admin, projectId);
  const { data: previousConnection } = connection ? { data: null } : await authorization.admin
    .from('google_connections')
    .select('status')
    .eq('project_id', projectId)
    .maybeSingle();
  const director = authorization.role === 'project_director';
  const leader = director || authorization.role === 'business_admin';
  return NextResponse.json({
    configured: true,
    connected: Boolean(connection),
    reconnect_required: previousConnection?.status === 'error',
    google_email: leader ? connection?.google_email || null : null,
    project_folder_id: director ? connection?.project_folder_id || null : null,
    sheet_id: director ? connection?.sheet_id || null : null,
    managed_by: connection ? 'Project Director' : null,
    missing: [],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
