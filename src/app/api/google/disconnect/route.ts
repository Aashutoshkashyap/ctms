import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GOOGLE_COOKIE_NAMES = [
  'bt_google_refresh_token',
  'bt_google_project_folder',
  'bt_google_daily_folder',
  'bt_google_expense_folder',
  'bt_google_employee_folder',
  'bt_google_document_folder',
  'bt_google_photo_folder',
  'bt_google_sheet_id',
  'bt_google_root_folder',
];

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true, message: 'Google Drive connection removed from this browser session.' });
  const secure = new URL(request.url).protocol === 'https:';
  GOOGLE_COOKIE_NAMES.forEach(name => {
    response.cookies.set(name, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 0,
    });
  });
  return response;
}
