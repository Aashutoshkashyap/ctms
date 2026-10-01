import { NextResponse } from 'next/server';
import { authorizeCompanyAdmin } from '../../../../lib/server/companyAdmin';
import { openwaClient, openwaConfigured, OpenwaError } from '../../../../lib/server/openwa/client';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

function publicConnection(row: Record<string, unknown> | null, configured: boolean) {
  if (!configured) return { configured: false, status: 'NOT_CONFIGURED', message: 'WhatsApp integration is not configured.' };
  return { configured: true, status: row?.status || 'NOT_CONNECTED', phone: row?.whatsapp_phone || null, displayName: row?.display_name || null, lastConnectedAt: row?.last_connected_at || null, lastDisconnectedAt: row?.last_disconnected_at || null, lastStatusAt: row?.last_status_at || null, lastError: row?.last_error || null };
}

function sessionNameFor(organizationId: string) { return `ctms-${organizationId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 45)}`; }

export async function GET(request: Request) {
  const auth = await authorizeCompanyAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const configured = openwaConfigured();
  const { data, error } = await auth.admin.from('organization_whatsapp_connections').select('status,whatsapp_phone,display_name,last_connected_at,last_disconnected_at,last_status_at,last_error').eq('organization_id', auth.organizationId).maybeSingle();
  if (error) return NextResponse.json({ error: 'WhatsApp connection state could not be loaded.' }, { status: 400 });
  return NextResponse.json(publicConnection(data, configured), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const limit = rateLimit({ key: `openwa-company-admin:${getClientIp(request)}`, limit: 8, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const auth = await authorizeCompanyAdmin(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!openwaConfigured()) return NextResponse.json({ error: 'WhatsApp integration is not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (!['pair', 'disconnect'].includes(String(action))) return NextResponse.json({ error: 'Use a supported WhatsApp connection action.' }, { status: 400 });
  const existing = await auth.admin.from('organization_whatsapp_connections').select('id,openwa_session_id,status').eq('organization_id', auth.organizationId).maybeSingle();
  if (existing.error) return NextResponse.json({ error: 'WhatsApp connection state could not be loaded.' }, { status: 400 });
  let sessionId = existing.data?.openwa_session_id || '';
  try {
    if (action === 'disconnect') {
      if (!existing.data) return NextResponse.json({ ok: true, status: 'DISCONNECTED' });
      await openwaClient.logout(sessionId);
      const { error } = await auth.admin.from('organization_whatsapp_connections').upsert({ id: existing.data?.id, organization_id: auth.organizationId, openwa_session_id: sessionId, status: 'DISCONNECTED', last_disconnected_at: new Date().toISOString(), last_status_at: new Date().toISOString(), last_error: null, connected_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
      if (error) throw new Error('Could not record WhatsApp disconnection.');
      return NextResponse.json({ ok: true, status: 'DISCONNECTED' });
    }
    let session;
    if (sessionId) {
      try { session = await openwaClient.session(sessionId); } catch (error) { if (!(error instanceof OpenwaError && error.status === 404)) throw error; }
    }
    if (!session) {
      const name = sessionNameFor(auth.organizationId);
      session = await openwaClient.sessionByName(name) || await openwaClient.createSession(name);
      sessionId = session.id;
    }
    if (!sessionId) throw new Error('OpenWA did not return a session identifier.');
    if (session.status?.toLowerCase() !== 'connected') session = await openwaClient.startSession(sessionId);
    const qr = session.status?.toLowerCase() === 'connected' ? null : await openwaClient.pairingQr(sessionId);
    const now = new Date().toISOString();
    const status = session.status?.toLowerCase() === 'connected' ? 'CONNECTED' : 'WAITING_FOR_PAIRING';
    const { error } = await auth.admin.from('organization_whatsapp_connections').upsert({ id: existing.data?.id, organization_id: auth.organizationId, openwa_session_id: sessionId, status, whatsapp_phone: session.phoneNumber || null, display_name: session.displayName || null, last_connected_at: status === 'CONNECTED' ? now : null, last_status_at: now, last_error: null, connected_by: auth.userId, updated_at: now }, { onConflict: 'organization_id' });
    if (error) throw new Error('Could not record WhatsApp pairing state.');
    // QR is transient pairing material. It is deliberately neither stored nor logged.
    return NextResponse.json({ ok: true, status, qr, phone: session.phoneNumber || null, displayName: session.displayName || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof OpenwaError ? error.message : 'WhatsApp connection could not be updated.';
    await auth.admin.from('organization_whatsapp_connections').upsert({ id: existing.data?.id, organization_id: auth.organizationId, openwa_session_id: sessionId, status: 'ERROR', last_status_at: new Date().toISOString(), last_error: message.slice(0, 500), connected_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
    return NextResponse.json({ error: message }, { status: error instanceof OpenwaError ? error.status : 502 });
  }
}
