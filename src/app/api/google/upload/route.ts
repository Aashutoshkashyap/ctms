import { NextResponse } from 'next/server';
import {
  appendSheetRow,
  getGoogleWorkspaceConfig,
  refreshAccessToken,
  safeDriveName,
  uploadFileToDrive,
} from '../../../../lib/server/googleWorkspace';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

function cookieValue(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `google-upload:${ip}`, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const config = getGoogleWorkspaceConfig(request);
  if (!config) return NextResponse.json({ ok: false, message: 'Google OAuth is not configured.' }, { status: 503 });
  const refreshToken = cookieValue(request, 'bt_google_refresh_token');
  if (!refreshToken) return NextResponse.json({ ok: false, message: 'Tenant Google Drive is not connected.' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'File is required.' }, { status: 400 });

  const category = String(form.get('category') || 'documents');
  const date = String(form.get('date') || new Date().toISOString().slice(0, 10));
  const employee = safeDriveName(String(form.get('employee') || 'unknown-employee')).replace(/\s+/g, '-');
  const boq = safeDriveName(String(form.get('boq') || 'general')).replace(/\s+/g, '-');
  const remarks = safeDriveName(String(form.get('remarks') || String(form.get('reference') || 'record'))).replace(/\s+/g, '-');
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  const driveName = `${date}_${employee}_${boq}_${remarks}${extension}`;

  const folderCookieByCategory: Record<string, string> = {
    daily_report: 'bt_google_daily_folder',
    expense: 'bt_google_expense_folder',
    employee: 'bt_google_employee_folder',
    photo: 'bt_google_photo_folder',
    document: 'bt_google_document_folder',
  };
  const folderId = cookieValue(request, folderCookieByCategory[category] || 'bt_google_document_folder') || cookieValue(request, 'bt_google_project_folder');
  if (!folderId) return NextResponse.json({ ok: false, message: 'Google project folder is missing. Reconnect Google Drive.' }, { status: 400 });

  const token = await refreshAccessToken(config, refreshToken);
  const uploaded = await uploadFileToDrive(token.access_token, file, driveName, folderId);
  const sheetId = cookieValue(request, 'bt_google_sheet_id');
  if (sheetId) {
    const sheet = category === 'expense' ? 'Expenses' : category === 'employee' ? 'Employees' : 'Daily Reports';
    await appendSheetRow(token.access_token, sheetId, sheet, [
      date,
      employee,
      boq,
      remarks,
      uploaded.name,
      uploaded.id,
      uploaded.webViewLink || '',
      new Date().toISOString(),
    ]).catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    file: {
      id: uploaded.id,
      name: uploaded.name,
      webViewLink: uploaded.webViewLink || '',
      folderId,
    },
  });
}
