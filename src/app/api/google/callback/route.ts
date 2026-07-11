import { NextResponse } from 'next/server';
import {
  createDriveFolder,
  createSpreadsheet,
  exchangeCodeForToken,
  getGoogleWorkspaceConfig,
  moveFileToFolder,
  safeDriveName,
} from '../../../../lib/server/googleWorkspace';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const config = getGoogleWorkspaceConfig(request);
  if (!config) return NextResponse.json({ ok: false, message: 'Google OAuth is not configured.' }, { status: 503 });

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error');
  if (error) return NextResponse.redirect(new URL(`/?google=error&message=${encodeURIComponent(error)}`, url.origin));
  if (!code) return NextResponse.json({ ok: false, message: 'Missing Google OAuth code.' }, { status: 400 });

  let parsedState = { organizationName: 'BuildTrack Tenant', projectName: 'Default Project', projectId: '', returnTo: '/' };
  try {
    parsedState = { ...parsedState, ...JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) };
  } catch {
    // keep defaults
  }

  const token = await exchangeCodeForToken(config, code);
  const rootFolder = await createDriveFolder(token.access_token, safeDriveName(`BuildTrack - ${parsedState.organizationName}`));
  const projectsFolder = await createDriveFolder(token.access_token, 'Projects', rootFolder.id);
  const projectFolder = await createDriveFolder(token.access_token, safeDriveName(`${parsedState.projectName}${parsedState.projectId ? ` - ${parsedState.projectId}` : ''}`), projectsFolder.id);
  const dailyFolder = await createDriveFolder(token.access_token, 'Daily Reports', projectFolder.id);
  const expenseFolder = await createDriveFolder(token.access_token, 'Expenses', projectFolder.id);
  const employeeFolder = await createDriveFolder(token.access_token, 'Employees', projectFolder.id);
  const documentFolder = await createDriveFolder(token.access_token, 'Documents', projectFolder.id);
  const photoFolder = await createDriveFolder(token.access_token, 'Photos', projectFolder.id);
  const sheet = await createSpreadsheet(token.access_token, safeDriveName(`BuildTrack Records - ${parsedState.projectName}`));
  await moveFileToFolder(token.access_token, sheet.spreadsheetId, projectFolder.id);

  const response = NextResponse.redirect(new URL(`${parsedState.returnTo}?google=connected`, url.origin));
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: url.protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  };
  if (token.refresh_token) response.cookies.set('bt_google_refresh_token', token.refresh_token, cookieOptions);
  response.cookies.set('bt_google_project_folder', projectFolder.id, cookieOptions);
  response.cookies.set('bt_google_daily_folder', dailyFolder.id, cookieOptions);
  response.cookies.set('bt_google_expense_folder', expenseFolder.id, cookieOptions);
  response.cookies.set('bt_google_employee_folder', employeeFolder.id, cookieOptions);
  response.cookies.set('bt_google_document_folder', documentFolder.id, cookieOptions);
  response.cookies.set('bt_google_photo_folder', photoFolder.id, cookieOptions);
  response.cookies.set('bt_google_sheet_id', sheet.spreadsheetId, cookieOptions);
  response.cookies.set('bt_google_root_folder', rootFolder.id, cookieOptions);
  return response;
}
