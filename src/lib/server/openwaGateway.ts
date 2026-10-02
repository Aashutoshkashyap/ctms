import { whatsappConfig } from './whatsappAdapter';

export type OpenWaSessionView = {
  available: boolean;
  connected: boolean;
  sessionName: string | null;
  phone: string | null;
  status: 'CONNECTED' | 'PAIRING' | 'DISCONNECTED' | 'UNAVAILABLE' | 'ERROR';
  message?: string;
};

export type OpenWaPairingView = OpenWaSessionView & { qrDataUrl?: string };

type OpenWaRow = Record<string, unknown>;

function configuredTransport() {
  const config = whatsappConfig();
  const sessionId = (process.env.WHATSAPP_OPENWA_SESSION_ID || '').trim();
  if (!config.endpoint || !config.apiKey || !sessionId) return null;
  try {
    const endpoint = new URL(config.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return null;
    return { endpoint, apiKey: config.apiKey, sessionId };
  } catch {
    return null;
  }
}

function sessionView(row: OpenWaRow, fallbackSessionName: string): OpenWaSessionView {
  const rawStatus = String(row.status || row.state || '').toUpperCase();
  const connected = ['CONNECTED', 'READY', 'AUTHENTICATED'].includes(rawStatus);
  const pairing = ['PAIRING', 'STARTING', 'SCAN_QR', 'QR'].includes(rawStatus);
  return {
    available: true,
    connected,
    sessionName: String(row.name || row.sessionName || fallbackSessionName),
    phone: typeof row.phone === 'string' ? row.phone : typeof row.phoneNumber === 'string' ? row.phoneNumber : null,
    status: connected ? 'CONNECTED' : pairing ? 'PAIRING' : 'DISCONNECTED',
  };
}

async function providerRequest(path: string, init: RequestInit = {}) {
  const transport = configuredTransport();
  if (!transport) return { transport: null, response: null } as const;
  const url = new URL(path, transport.endpoint);
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'X-API-Key': transport.apiKey, ...(init.headers || {}) },
    cache: 'no-store',
  });
  return { transport, response } as const;
}

async function responseJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

/**
 * The browser sees only a small, session-scoped health view. The provider URL
 * and API key never leave this server-only gateway.
 */
export async function readManagedOpenWaSession(): Promise<OpenWaSessionView> {
  const transport = configuredTransport();
  if (!transport) return { available: false, connected: false, sessionName: null, phone: null, status: 'UNAVAILABLE', message: 'WhatsApp is not configured by the deployment administrator.' };
  try {
    const { response } = await providerRequest(`/api/sessions/${encodeURIComponent(transport.sessionId)}`);
    if (!response?.ok) return { available: true, connected: false, sessionName: null, phone: null, status: 'ERROR', message: 'The WhatsApp transport is temporarily unavailable.' };
    const body = await responseJson(response);
    return sessionView((body && typeof body === 'object' ? body : {}) as OpenWaRow, transport.sessionId);
  } catch {
    return { available: true, connected: false, sessionName: null, phone: null, status: 'ERROR', message: 'The WhatsApp transport could not be reached.' };
  }
}

/** Starts the pre-configured provider session and returns a short-lived QR only to an authorized CTMS leader. */
export async function startManagedOpenWaPairing(): Promise<OpenWaPairingView> {
  const transport = configuredTransport();
  if (!transport) return { available: false, connected: false, sessionName: null, phone: null, status: 'UNAVAILABLE', message: 'WhatsApp is not configured by the deployment administrator.' };
  const current = await readManagedOpenWaSession();
  if (current.connected) return current;
  try {
    const started = await providerRequest(`/api/sessions/${encodeURIComponent(transport.sessionId)}/start`, { method: 'POST' });
    if (!started.response?.ok && started.response?.status !== 409) return { ...current, status: 'ERROR', message: 'Could not start WhatsApp pairing. Try again shortly.' };
    const qr = await providerRequest(`/api/sessions/${encodeURIComponent(transport.sessionId)}/qr`);
    if (!qr.response?.ok) return { ...current, status: 'PAIRING', message: 'Pairing is starting. Refresh in a few seconds.' };
    const body = await responseJson(qr.response) as OpenWaRow | null;
    const qrDataUrl = typeof body?.qrCode === 'string' ? body.qrCode : typeof body?.qr === 'string' ? body.qr : '';
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qrDataUrl) || qrDataUrl.length > 100_000) {
      return { ...current, status: 'PAIRING', message: 'A new QR is being generated. Refresh in a few seconds.' };
    }
    return { ...current, status: 'PAIRING', qrDataUrl };
  } catch {
    return { ...current, status: 'ERROR', message: 'Could not start WhatsApp pairing. Try again shortly.' };
  }
}
