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

interface GoogleOAuthStateBase {
  userId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface GoogleProjectOAuthState extends GoogleOAuthStateBase {
  purpose?: 'project_workspace';
  projectId: string;
  organizationId: string;
}

export interface GooglePlatformEmailOAuthState extends GoogleOAuthStateBase {
  purpose: 'platform_email';
}

export type GoogleOAuthState = GoogleProjectOAuthState | GooglePlatformEmailOAuthState;

export function getGoogleSecuritySecret() {
  const configured = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return process.env.BUILDTRACK_SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
  return '';
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes).toString('base64url');
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function signGoogleOAuthState(payload: GoogleOAuthState) {
  const secret = getGoogleSecuritySecret();
  if (!secret) throw new Error('Google token encryption is not configured.');
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

export async function verifyGoogleOAuthState(value: string): Promise<GoogleOAuthState | null> {
  const secret = getGoogleSecuritySecret();
  if (!secret) return null;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = await hmac(encoded, secret);
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as GoogleOAuthState;
    if (!payload.userId || !payload.nonce || payload.expiresAt <= Date.now()) return null;
    if (payload.purpose !== 'platform_email' && (!payload.projectId || !payload.organizationId)) return null;
    if (payload.issuedAt > Date.now() + 60_000 || payload.expiresAt - payload.issuedAt > 10 * 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptGoogleRefreshToken(refreshToken: string) {
  const secret = getGoogleSecuritySecret();
  if (!secret) throw new Error('Google token encryption is not configured.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), new TextEncoder().encode(refreshToken));
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

export async function decryptGoogleRefreshToken(value: string) {
  const secret = getGoogleSecuritySecret();
  if (!secret) throw new Error('Google token encryption is not configured.');
  const [version, encodedIv, encodedCipher, extra] = value.split('.');
  if (version !== 'v1' || !encodedIv || !encodedCipher || extra) throw new Error('Stored Google connection is invalid.');
  const iv = new Uint8Array(Buffer.from(encodedIv, 'base64url'));
  const cipher = new Uint8Array(Buffer.from(encodedCipher, 'base64url'));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), cipher);
  return new TextDecoder().decode(decrypted);
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
    'openid',
    'email',
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

export function buildPlatformEmailAuthUrl(config: GoogleWorkspaceConfig, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '),
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

export async function getGoogleAccountEmail(accessToken: string) {
  const profile = await googleFetch<{ email?: string }>('https://openidconnect.googleapis.com/v1/userinfo', accessToken);
  return profile.email || '';
}

export async function revokeGoogleToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => undefined);
}

export function safeDriveName(value: string) {
  return value.replace(/[\\/:*?"<>|#{}%~&]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Untitled';
}
