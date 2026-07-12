import { NextResponse } from 'next/server';
import { authorizeGoogleRequest, readGoogleConnection } from '../../../../lib/server/googleConnection';
import {
  appendSheetRow,
  decryptGoogleRefreshToken,
  getGoogleWorkspaceConfig,
  refreshAccessToken,
  safeDriveName,
  uploadFileToDrive,
} from '../../../../lib/server/googleWorkspace';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

const UPLOAD_ROLES = [
  'project_director', 'project_manager', 'planning_engineer', 'site_engineer', 'field_employee',
  'qa_qc_engineer', 'safety_officer', 'qs_billing_engineer', 'accountant', 'store_officer',
  'design_coordinator', 'subcontractor',
];
const CATEGORIES = ['daily_report', 'expense', 'employee', 'photo', 'document'] as const;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `google-upload:${ip}`, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const config = getGoogleWorkspaceConfig(request);
  if (!config) return NextResponse.json({ ok: false, message: 'Google OAuth is not configured.' }, { status: 503 });
  const projectId = request.headers.get('x-buildtrack-project') || '';
  if (!projectId) return NextResponse.json({ ok: false, message: 'Project is required.' }, { status: 400 });
  const authorization = await authorizeGoogleRequest(request, projectId, UPLOAD_ROLES);
  if ('error' in authorization) return NextResponse.json({ ok: false, message: authorization.error }, { status: authorization.status });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, message: 'A non-empty file is required.' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, message: 'Google Drive uploads are limited to 25 MB per file.' }, { status: 413 });
  const rawCategory = String(form.get('category') || 'document');
  const category = CATEGORIES.includes(rawCategory as typeof CATEGORIES[number]) ? rawCategory as typeof CATEGORIES[number] : 'document';
  if (category === 'photo' && !file.type.startsWith('image/')) {
    return NextResponse.json({ ok: false, message: 'Verification evidence must be an image file.' }, { status: 415 });
  }

  const connection = await readGoogleConnection(authorization.admin, projectId);
  if (!connection?.encrypted_refresh_token) return NextResponse.json({ ok: false, message: 'The Project Director has not connected Google Drive for this project.' }, { status: 409 });

  const date = String(form.get('date') || new Date().toISOString().slice(0, 10));
  const employee = safeDriveName(String(form.get('employee') || 'unknown-employee')).replace(/\s+/g, '-');
  const boq = safeDriveName(String(form.get('boq') || 'general')).replace(/\s+/g, '-');
  const remarks = safeDriveName(String(form.get('remarks') || String(form.get('reference') || 'record'))).replace(/\s+/g, '-');
  const extension = file.name.includes('.') ? `.${safeDriveName(file.name.split('.').pop() || '').replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const driveName = `${date}_${employee}_${boq}_${remarks}${extension}`;
  const folderByCategory: Record<typeof CATEGORIES[number], string | null> = {
    daily_report: connection.daily_folder_id,
    expense: connection.expense_folder_id,
    employee: connection.employee_folder_id,
    photo: connection.photo_folder_id,
    document: connection.document_folder_id,
  };
  const folderId = folderByCategory[category] || connection.project_folder_id;
  if (!folderId) return NextResponse.json({ ok: false, message: 'The Google project folder is missing. Ask the Director to reconnect.' }, { status: 409 });

  try {
    const refreshToken = await decryptGoogleRefreshToken(connection.encrypted_refresh_token);
    const token = await refreshAccessToken(config, refreshToken);
    const uploaded = await uploadFileToDrive(token.access_token, file, driveName, folderId);
    if (connection.sheet_id && category !== 'document') {
      const sheet = category === 'expense' ? 'Expenses' : category === 'employee' ? 'Employees' : 'Daily Reports';
      await appendSheetRow(token.access_token, connection.sheet_id, sheet, [
        date, employee, boq, remarks, uploaded.name, uploaded.id, uploaded.webViewLink || '', new Date().toISOString(),
      ]).catch(() => null);
    }
    return NextResponse.json({
      ok: true,
      file: { id: uploaded.id, name: uploaded.name, webViewLink: uploaded.webViewLink || '', folderId },
    });
  } catch (error) {
    await authorization.admin.from('google_connections').update({ status: 'error', updated_at: new Date().toISOString() }).eq('project_id', projectId);
    console.error('Google upload failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ ok: false, message: 'Google Drive upload failed. Ask the Director to reconnect the project storage.' }, { status: 502 });
  }
}
