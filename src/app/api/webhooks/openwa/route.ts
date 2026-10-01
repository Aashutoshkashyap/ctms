import { createHmac, timingSafeEqual } from 'node:crypto';
import { tenantAdminClient } from '../../../../lib/server/projectAuthorization';
import { openwaWebhookSecret } from '../../../../lib/server/openwa/client';
import { normalizeInboundEvent, recordInboundMessage } from '../../../../lib/server/openwa/inbound';

export const dynamic = 'force-dynamic';

function validSignature(body: string, timestamp: string, provided: string, secret: string) {
  if (!secret || !provided || (timestamp && (!Number.isFinite(Number(timestamp)) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000))) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const supplied = provided.replace(/^sha256=/i, '');
  return expected.length === supplied.length && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function POST(request: Request) {
  const raw = await request.text();
  const timestamp = request.headers.get('x-openwa-timestamp') || '';
  const signature = request.headers.get('x-openwa-signature') || '';
  if (!validSignature(raw, timestamp, signature, openwaWebhookSecret())) return Response.json({ error: 'Webhook authentication failed.' }, { status: 401 });
  const payload = JSON.parse(raw) as unknown;
  const inbound = normalizeInboundEvent(payload);
  if (!inbound || !/message\.received|message\.create|message/i.test(inbound.eventType)) return Response.json({ ok: true, ignored: true });
  const admin = tenantAdminClient();
  if (!admin) return Response.json({ error: 'Webhook integration is not configured.' }, { status: 503 });
  const connection = await admin.from('organization_whatsapp_connections').select('id,organization_id,openwa_session_id').eq('openwa_session_id', inbound.sessionId).maybeSingle();
  if (connection.error || !connection.data) return Response.json({ error: 'Unknown WhatsApp session.' }, { status: 404 });
  try {
    const result = await recordInboundMessage(admin, connection.data, inbound);
    return Response.json({ ok: true, duplicate: result.duplicate, routed: result.routed });
  } catch {
    return Response.json({ error: 'Webhook processing failed.' }, { status: 502 });
  }
}
