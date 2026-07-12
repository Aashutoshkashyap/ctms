import { NextResponse } from 'next/server';
import { authorizeGoogleCallbackUser } from '../../../../lib/server/googleConnection';
import {
  createDriveFolder,
  createSpreadsheet,
  encryptGoogleRefreshToken,
  exchangeCodeForToken,
  getGoogleAccountEmail,
  getGoogleWorkspaceConfig,
  moveFileToFolder,
  safeDriveName,
  verifyGoogleOAuthState,
} from '../../../../lib/server/googleWorkspace';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

function redirectWithStatus(origin: string, status: 'connected' | 'error', message?: string) {
  const destination = new URL('/', origin);
  destination.searchParams.set('google', status);
  if (message) destination.searchParams.set('message', message.slice(0, 160));
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `google-callback:${ip}`, limit: 20, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const config = getGoogleWorkspaceConfig(request);
  const url = new URL(request.url);
  if (!config) return redirectWithStatus(url.origin, 'error', 'Google OAuth is not configured.');
  const oauthError = url.searchParams.get('error');
  if (oauthError) return redirectWithStatus(url.origin, 'error', oauthError);
  const code = url.searchParams.get('code');
  const state = await verifyGoogleOAuthState(url.searchParams.get('state') || '');
  if (!code || !state) return redirectWithStatus(url.origin, 'error', 'Google authorization request expired or was invalid.');

  const authorization = await authorizeGoogleCallbackUser(state.userId, state.projectId, ['project_director']);
  if ('error' in authorization || authorization.project.organizationId !== state.organizationId) {
    return redirectWithStatus(url.origin, 'error', 'Project authorization could not be verified.');
  }

  try {
    const token = await exchangeCodeForToken(config, code);
    if (!token.refresh_token) throw new Error('Google did not return an offline refresh token. Revoke the app grant and reconnect.');
    const rootFolder = await createDriveFolder(token.access_token, safeDriveName(`BuildTrack - ${authorization.project.organizationName}`));
    const projectsFolder = await createDriveFolder(token.access_token, 'Projects', rootFolder.id);
    const projectFolder = await createDriveFolder(token.access_token, safeDriveName(`${authorization.project.name} - ${authorization.project.id}`), projectsFolder.id);
    const [dailyFolder, expenseFolder, employeeFolder, documentFolder, photoFolder] = await Promise.all([
      createDriveFolder(token.access_token, 'Daily Reports', projectFolder.id),
      createDriveFolder(token.access_token, 'Expenses', projectFolder.id),
      createDriveFolder(token.access_token, 'Employees', projectFolder.id),
      createDriveFolder(token.access_token, 'Documents', projectFolder.id),
      createDriveFolder(token.access_token, 'Photos', projectFolder.id),
    ]);
    const sheet = await createSpreadsheet(token.access_token, safeDriveName(`BuildTrack Records - ${authorization.project.name}`));
    await moveFileToFolder(token.access_token, sheet.spreadsheetId, projectFolder.id);
    const encryptedRefreshToken = await encryptGoogleRefreshToken(token.refresh_token);
    const googleEmail = await getGoogleAccountEmail(token.access_token).catch(() => '');
    const { error } = await authorization.admin.from('google_connections').upsert({
      id: `google-${authorization.project.id}`,
      organization_id: authorization.project.organizationId,
      project_id: authorization.project.id,
      connected_by: authorization.userId,
      google_email: googleEmail || null,
      root_folder_id: rootFolder.id,
      project_folder_id: projectFolder.id,
      daily_folder_id: dailyFolder.id,
      expense_folder_id: expenseFolder.id,
      employee_folder_id: employeeFolder.id,
      document_folder_id: documentFolder.id,
      photo_folder_id: photoFolder.id,
      sheet_id: sheet.spreadsheetId,
      encrypted_refresh_token: encryptedRefreshToken,
      status: 'connected',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
    if (error) throw new Error(error.message);
    return redirectWithStatus(url.origin, 'connected');
  } catch (error) {
    console.error('Google workspace connection failed:', error instanceof Error ? error.message : 'unknown error');
    return redirectWithStatus(url.origin, 'error', 'Google workspace setup failed. Review the OAuth configuration and try again.');
  }
}
