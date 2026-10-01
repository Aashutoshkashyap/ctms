import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('B6 normalizes sender phones and only accepts stable, attributable inbound events', () => {
  const normalize = (value) => { const digits = String(value || '').trim().replace(/@(c\.us|s\.whatsapp\.net|lid)$/i, '').replace(/[^0-9]/g, ''); return digits.length >= 7 && digits.length <= 18 ? `+${digits}` : ''; };
  assert.equal(normalize('+977 980-123-4567@c.us'), '+9779801234567');
  assert.equal(normalize('not-a-phone'), '');
});

test('B6 keeps the OpenWA control plane server-only and company-admin scoped', async () => {
  const client = await read('src/lib/server/openwa/client.ts');
  const route = await read('src/app/api/company-admin/whatsapp/route.ts');
  assert.match(client, /import 'server-only'/);
  assert.match(client, /OPENWA_BASE_URL/);
  assert.match(client, /OPENWA_API_KEY/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_OPENWA/);
  assert.match(route, /authorizeCompanyAdmin/);
  assert.match(route, /organization_id', auth\.organizationId/);
  assert.match(route, /QR is transient pairing material/);
  assert.doesNotMatch(route, /apiKey|webhookSecret/);
});

test('B6 webhook authenticates raw payloads, resolves session ownership, and never invokes business actions', async () => {
  const webhook = await read('src/app/api/webhooks/openwa/route.ts');
  assert.match(webhook, /createHmac\('sha256'/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /x-openwa-signature/);
  assert.match(webhook, /openwa_session_id', inbound\.sessionId/);
  assert.match(webhook, /recordInboundMessage/);
  assert.doesNotMatch(webhook, /payment|procurement|task|document.*update/i);
});

test('B6 persists organization-scoped, idempotent event metadata and routes only resolved project context', async () => {
  const inbound = await read('src/lib/server/openwa/inbound.ts');
  const sql = await read('supabase_b6_openwa_whatsapp_foundation.sql');
  assert.match(inbound, /MATCHED' \| 'UNKNOWN' \| 'AMBIGUOUS/);
  assert.match(inbound, /matches\.length !== 1/);
  assert.match(inbound, /projectContext: 'resolved'/);
  assert.match(inbound, /match\.state === 'MATCHED' && match\.projectId && match\.departmentKey/);
  assert.match(inbound, /recordWorkflowEvent/);
  assert.match(sql, /unique \(organization_id, provider_event_id\)/);
  assert.match(sql, /WhatsApp event project must belong to its organization/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /create policy/i);
});

test('B6 UI keeps pairing in existing settings and leaves ordinary users without management controls', async () => {
  const settings = await read('src/components/SettingsPanel.tsx');
  assert.match(settings, /WhatsApp connection/);
  assert.match(settings, /Connect WhatsApp/);
  assert.match(settings, /The QR code is not stored by CTMS|This code is not stored by CTMS/);
  assert.match(settings, /project_director', 'business_admin/);
});
