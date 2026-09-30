import { NextResponse } from 'next/server';
import { normalizeOpenWaEvent, toProviderInboundWhatsAppEvent, verifyOpenWaSignature, whatsappConfig } from '../../../../lib/server/whatsappAdapter';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';
import { tenantAdminClient } from '../../../../lib/server/projectAuthorization';
import { readOpenWaConfiguration } from '../../../../lib/server/openwaProvider';
import { buildOpenWaInboundProcessor } from '../../../../lib/server/openwaLiveInbound';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const limit = rateLimit({ key: `openwa-webhook:${getClientIp(request)}`, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const config = whatsappConfig();
  if (!config.enabled) return NextResponse.json({ error: 'WhatsApp integration is disabled.' }, { status: 503 });
  if (!config.webhookSecret) return NextResponse.json({ error: 'WhatsApp webhook is not configured.' }, { status: 503 });
  const admin = tenantAdminClient();
  if (!admin) return NextResponse.json({ error: 'WhatsApp server storage is not configured.' }, { status: 503 });
  const rawBody = await request.text();
  if (rawBody.length > 128_000) return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 });
  if (!verifyOpenWaSignature(rawBody, request.headers.get(config.signatureHeader), config.webhookSecret)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Malformed event.' }, { status: 400 }); }
  const event = normalizeOpenWaEvent(payload);
  if (!event) return NextResponse.json({ error: 'Unsupported inbound event.' }, { status: 400 });
  // Provider-supplied organization/project/user metadata is intentionally
  // discarded by normalization. Identity determines organization server-side.
  if (!config.webhookSecretRef) return NextResponse.json({ error: 'WhatsApp secret reference is not configured.' }, { status: 503 });
  const processor = buildOpenWaInboundProcessor(admin, {
    // The database is the organization-scoped source of provider state. The
    // environment supplies secret material; the opaque reference must match.
    allowOrganization: async organizationId => {
      const provider = await readOpenWaConfiguration(admin, organizationId);
      return provider?.state === 'ENABLED'
        && provider.endpoint_base_url === config.endpoint
        && provider.webhook_secret_ref === config.webhookSecretRef;
    },
  });
  const result = await processor.handle(toProviderInboundWhatsAppEvent(event));
  return NextResponse.json({ ok: result.code === 'ACCEPTED' || result.code === 'DUPLICATE', code: result.code, response: result.response }, { status: result.code === 'TEMPORARY_FAILURE' ? 503 : result.code === 'UNAUTHORIZED' || result.code === 'IDENTITY_NOT_VERIFIED' ? 403 : 200 });
}
