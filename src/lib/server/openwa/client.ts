import 'server-only';

export type OpenwaSession = {
  id: string;
  status?: string;
  phoneNumber?: string | null;
  displayName?: string | null;
  connectedAt?: string | null;
};

export class OpenwaError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

type OpenwaConfig = { baseUrl: string; apiKey: string; webhookSecret: string; timeoutMs: number };

function config(): OpenwaConfig | null {
  const baseUrl = process.env.OPENWA_BASE_URL?.trim().replace(/\/$/, '');
  const apiKey = process.env.OPENWA_API_KEY?.trim();
  const webhookSecret = process.env.OPENWA_WEBHOOK_SECRET?.trim();
  if (!baseUrl || !apiKey || !webhookSecret) return null;
  const timeoutMs = Number(process.env.OPENWA_REQUEST_TIMEOUT_MS || 12_000);
  return { baseUrl, apiKey, webhookSecret, timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1_000, Math.min(timeoutMs, 30_000)) : 12_000 };
}

export function openwaConfigured() { return Boolean(config()); }
export function openwaWebhookSecret() { return config()?.webhookSecret || ''; }

function asSession(value: unknown): OpenwaSession {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : row;
  return {
    id: String(data.id || data.sessionId || data.session_id || data.name || ''),
    status: typeof data.status === 'string' ? data.status : undefined,
    phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : typeof data.phone === 'string' ? data.phone : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : typeof data.pushName === 'string' ? data.pushName : typeof data.name === 'string' ? data.name : null,
    connectedAt: typeof data.connectedAt === 'string' ? data.connectedAt : null,
  };
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const settings = config();
  if (!settings) throw new OpenwaError('WhatsApp integration is not configured.', 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const response = await fetch(`${settings.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'X-API-Key': settings.apiKey, ...(init?.headers || {}) },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new OpenwaError(typeof (body as { message?: unknown } | null)?.message === 'string' ? (body as { message: string }).message : 'OpenWA did not accept this request.', response.status);
    return body;
  } catch (error) {
    if (error instanceof OpenwaError) throw error;
    throw new OpenwaError(error instanceof DOMException && error.name === 'AbortError' ? 'OpenWA request timed out.' : 'OpenWA is temporarily unavailable.');
  } finally { clearTimeout(timer); }
}

// These narrow calls follow the current OpenWA REST session surface. No broad
// gateway wrapper is exposed to CTMS application code.
export const openwaClient = {
  async session(sessionId: string) { return asSession(await request(`/api/sessions/${encodeURIComponent(sessionId)}`)); },
  async sessionByName(name: string) {
    const result = await request(`/api/sessions?name=${encodeURIComponent(name)}`);
    const list = Array.isArray(result) ? result : result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).data) ? (result as Record<string, unknown>).data as unknown[] : [];
    return list[0] ? asSession(list[0]) : null;
  },
  async createSession(name: string) { return asSession(await request('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })); },
  async startSession(sessionId: string) { return asSession(await request(`/api/sessions/${encodeURIComponent(sessionId)}/start`, { method: 'POST' })); },
  async pairingQr(sessionId: string) {
    const result = await request(`/api/sessions/${encodeURIComponent(sessionId)}/qr`);
    const row = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : row;
    const qr = data.qr || data.qrCode || data.qrcode;
    if (typeof qr !== 'string' || !qr) throw new OpenwaError('OpenWA did not provide a pairing code.', 502);
    return qr;
  },
  async logout(sessionId: string) { await request(`/api/sessions/${encodeURIComponent(sessionId)}/logout`, { method: 'POST' }); },
  async ensureInboundWebhook(sessionId: string, url: string) {
    const existing = await request(`/api/sessions/${encodeURIComponent(sessionId)}/webhooks`);
    const rows = Array.isArray(existing) ? existing : existing && typeof existing === 'object' && Array.isArray((existing as Record<string, unknown>).data) ? (existing as Record<string, unknown>).data as Array<Record<string, unknown>> : [];
    if (rows.some((row) => row.url === url && Array.isArray(row.events) && row.events.includes('message.received'))) return;
    const settings = config();
    if (!settings) throw new OpenwaError('WhatsApp integration is not configured.', 503);
    await request(`/api/sessions/${encodeURIComponent(sessionId)}/webhooks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, events: ['message.received'], secret: settings.webhookSecret, retryCount: 3 }) });
  },
};

export function isOpenwaReady(status?: string) { return status?.toLowerCase() === 'ready'; }
