import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProviderInboundWhatsAppEvent } from './whatsappInboundFieldUpdate';

export type WhatsAppMessageType = 'text' | 'image' | 'audio' | 'document' | 'unknown';
export type NormalizedInboundWhatsAppEvent = {
  provider: 'openwa'; providerMessageId: string; senderWhatsAppNumber: string;
  channel: 'WHATSAPP'; messageType: WhatsAppMessageType; text?: string; mediaReference?: string; receivedAt: string;
  replyToMessageId?: string;
  metadata?: Record<string, string | number | boolean>;
};
export type OutboundWhatsAppIntent = { recipientWhatsAppNumber: string; content: string; projectId?: string; mediaReference?: string };
export type WhatsAppIdentity = { authUserId: string; whatsappNumber: string; projectIds: string[] };
export type OpenWaProviderState = 'DISABLED' | 'CONFIGURED' | 'ENABLED' | 'ERROR';

/** Provider-neutral contracts. OpenWA is deliberately kept at this edge. */
export interface WhatsAppIdentityResolver { resolve(senderWhatsAppNumber: string): Promise<WhatsAppIdentity | null>; }
export interface WhatsAppIdempotencyStore { seen(provider: string, providerMessageId: string): Promise<boolean>; record(provider: string, providerMessageId: string): Promise<void>; }
export interface WhatsAppOutbox { enqueue(intent: OutboundWhatsAppIntent): Promise<{ id: string; status: 'pending' }>; }

export function whatsappConfig() {
  // Two deliberate server-only switches are required. A URL or a database
  // configuration alone can never accidentally expose the webhook.
  const enabled = process.env.WHATSAPP_ENABLED === 'true' && process.env.OPENWA_TRANSPORT_ACTIVATED === 'true';
  return {
    enabled,
    state: enabled ? 'ENABLED' as OpenWaProviderState : process.env.WHATSAPP_OPENWA_ENDPOINT ? 'CONFIGURED' as OpenWaProviderState : 'DISABLED' as OpenWaProviderState,
    endpoint: process.env.WHATSAPP_OPENWA_ENDPOINT || '',
    apiKey: process.env.WHATSAPP_OPENWA_API_KEY || '',
    webhookSecret: process.env.WHATSAPP_OPENWA_WEBHOOK_SECRET || '',
    webhookSecretRef: process.env.OPENWA_WEBHOOK_SECRET_REF || '',
    signatureHeader: (process.env.WHATSAPP_OPENWA_SIGNATURE_HEADER || 'x-webhook-signature').toLowerCase(),
  };
}

export function normalizeOpenWaEvent(payload: unknown): NormalizedInboundWhatsAppEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const providerMessageId = String(row.id || row.messageId || row.providerMessageId || '').trim();
  const senderWhatsAppNumber = String(row.from || row.sender || row.senderWhatsAppNumber || '').replace(/[^0-9+]/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(providerMessageId) || !senderWhatsAppNumber) return null;
  const rawType = String(row.type || row.messageType || 'unknown').toLowerCase();
  const messageType: WhatsAppMessageType = ['text', 'image', 'audio', 'document'].includes(rawType) ? rawType as WhatsAppMessageType : 'unknown';
  return { provider: 'openwa', providerMessageId, senderWhatsAppNumber, channel: 'WHATSAPP', messageType, text: typeof row.text === 'string' ? row.text : undefined, mediaReference: typeof row.mediaReference === 'string' ? row.mediaReference : undefined, replyToMessageId: typeof row.replyToMessageId === 'string' ? row.replyToMessageId : undefined, receivedAt: typeof row.timestamp === 'string' ? row.timestamp : new Date().toISOString() };
}

/** OpenWA delivery is intentionally unsupported until a later outbound phase. */
export function queueOpenWaOutboundIntent(_intent: OutboundWhatsAppIntent, config = whatsappConfig()) {
  return config.enabled
    ? { status: 'PENDING_UNSUPPORTED' as const, reason: 'OpenWA outbound delivery is not implemented.' }
    : { status: 'PENDING_UNSUPPORTED' as const, reason: 'OpenWA is disabled; BuildTrack notifications remain available in-app.' };
}

/** OpenWA transport data ends here; the next layer sees only provider-neutral input. */
export function toProviderInboundWhatsAppEvent(event: NormalizedInboundWhatsAppEvent): ProviderInboundWhatsAppEvent {
  const kind = event.messageType === 'image' ? 'photo' : event.messageType === 'audio' ? 'audio' : event.messageType === 'document' ? 'document' : null;
  return {
    provider: event.provider, providerMessageId: event.providerMessageId, channel: event.channel,
    senderAddress: event.senderWhatsAppNumber, receivedAt: event.receivedAt, text: event.text,
    replyToMessageId: event.replyToMessageId,
    media: kind && event.mediaReference ? [{ kind, providerReference: event.mediaReference }] : [],
  };
}

export function verifyOpenWaSignature(rawBody: string, signature: string | null, secret: string) {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const supplied = signature.replace(/^sha256=/i, '');
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

/**
 * No identity fallback is permitted. A phone number is not a BuildTrack user.
 * A future database-backed resolver must verify sender -> user -> project membership,
 * then call a server-safe canonical Daily Work Update command.
 */
export const unavailableIdentityResolver: WhatsAppIdentityResolver = { resolve: async () => null };
