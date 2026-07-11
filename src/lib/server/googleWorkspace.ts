const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface GoogleWorkspaceConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export function getGoogleWorkspaceConfig(request?: Request): GoogleWorkspaceConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const configuredRedirect = process.env.GOOGLE_REDIRECT_URI || '';
  const origin = request ? new URL(request.url).origin : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = configuredRedirect || `${origin}/api/google/callback`;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthUrl(config: GoogleWorkspaceConfig, state: string) {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
  ];
  if (process.env.GOOGLE_ENABLE_GMAIL_SEND === 'true') {
    scopes.push('https://www.googleapis.com/auth/gmail.send');
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: scopes.join(' '),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(config: GoogleWorkspaceConfig, code: string): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || 'Google token exchange failed.');
  return json;
}

export async function refreshAccessToken(config: GoogleWorkspaceConfig, refreshToken: string): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || 'Google token refresh failed.');
  return json;
}

async function googleFetch<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || json.error_description || `Google API failed: ${response.status}`);
  return json as T;
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string) {
  return googleFetch<{ id: string; name: string }>(`${DRIVE_API}/files`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
}

export async function createSpreadsheet(accessToken: string, title: string) {
  return googleFetch<{ spreadsheetId: string; spreadsheetUrl: string }>(SHEETS_API, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Employees' } },
        { properties: { title: 'Expenses' } },
        { properties: { title: 'Daily Reports' } },
        { properties: { title: 'Inventory' } },
      ],
    }),
  });
}

export async function moveFileToFolder(accessToken: string, fileId: string, folderId: string) {
  return googleFetch<{ id: string }>(`${DRIVE_API}/files/${fileId}?addParents=${encodeURIComponent(folderId)}&fields=id,parents`, accessToken, {
    method: 'PATCH',
  });
}

export async function uploadFileToDrive(accessToken: string, file: File, name: string, folderId: string) {
  const boundary = `buildtrack-${crypto.randomUUID()}`;
  const metadata = {
    name,
    parents: [folderId],
  };
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return googleFetch<{ id: string; name: string; webViewLink?: string }>(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export async function appendSheetRow(accessToken: string, spreadsheetId: string, sheetName: string, values: unknown[]) {
  return googleFetch(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z:append?valueInputOption=USER_ENTERED`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
}

export async function sendGmailMessage(accessToken: string, to: string, subject: string, body: string) {
  const raw = Buffer.from([
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n')).toString('base64url');
  return googleFetch<{ id: string; threadId: string }>('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
}

export function safeDriveName(value: string) {
  return value.replace(/[\\/:*?"<>|#{}%~&]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Untitled';
}
