import type { FieldMediaReference, FieldUpdateProjectContext } from '../fieldUpdateIntake';
import type { CanonicalFieldUpdateInput, CanonicalFieldUpdateOutcome, TrustedFieldUpdateContext } from './canonicalFieldUpdate';

export type ProviderInboundMedia = { kind: 'photo' | 'audio' | 'document'; providerReference: string; storageConfirmed?: boolean; storageReference?: string };
export type ProviderInboundWhatsAppEvent = {
  provider: string; providerMessageId: string; channel: 'WHATSAPP'; senderAddress: string; receivedAt: string;
  text?: string; media?: ProviderInboundMedia[]; replyToMessageId?: string;
};
export type InboundOrganizationContext = {
  organizationId: string;
  projects: FieldUpdateProjectContext[];
  projectLabels: Array<{ id: string; name: string }>;
  communicationIdentity: TrustedFieldUpdateContext['communicationIdentity'];
};
export type VerifiedInboundSender = { status: 'verified'; personId: string; organizations: InboundOrganizationContext[] };
export type InboundSenderResolution = VerifiedInboundSender | { status: 'unknown' | 'not_verified' };
export type PendingQuestion = 'organization' | 'project' | 'activity';
export type PendingConversationContext = {
  id: string; provider: string; originProviderMessageId: string; lastProviderMessageId: string;
  personId: string; organizationId?: string; question: PendingQuestion;
  input: Omit<CanonicalFieldUpdateInput, 'operationId' | 'source'>;
  options: Array<{ id: string; label: string }>;
  expiresAt: string; state: 'pending' | 'resolved' | 'expired';
};
export type InboundConversationStore = {
  findByMessage(provider: string, providerMessageId: string): Promise<PendingConversationContext | null>;
  findActive(provider: string, personId: string, now: string): Promise<PendingConversationContext | null>;
  save(context: PendingConversationContext): Promise<void>;
  resolve(id: string, providerMessageId: string): Promise<void>;
};
export type InboundCanonicalCommand = {
  create(input: CanonicalFieldUpdateInput, context: TrustedFieldUpdateContext): Promise<CanonicalFieldUpdateOutcome>;
};
export type WhatsAppInboundResult = CanonicalFieldUpdateOutcome & { response: string; pending?: PendingConversationContext; pendingMedia?: ProviderInboundMedia[] };

const CONTEXT_TTL_MS = 30 * 60 * 1000;
const opaqueReference = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;

function safeText(value?: string) { return typeof value === 'string' ? value.trim().slice(0, 4000) : ''; }
function operationId(event: ProviderInboundWhatsAppEvent) { return `whatsapp:${event.provider}:${event.providerMessageId}`; }
function selectIndex(text: string, options: Array<{ id: string; label: string }>) {
  const index = Number.parseInt(text.trim(), 10);
  return Number.isInteger(index) && index >= 1 && index <= options.length ? options[index - 1] : null;
}
function responseFor(result: CanonicalFieldUpdateOutcome) {
  if (result.code === 'ACCEPTED') return 'Update recorded.';
  if (result.code === 'DUPLICATE') return 'This update was already received.';
  if (result.code === 'IDENTITY_NOT_VERIFIED') return 'Your WhatsApp number is not verified. Please contact your project administrator.';
  if (result.code === 'UNAUTHORIZED' || result.code === 'PROJECT_NOT_AUTHORIZED') return 'You do not have access to submit this update.';
  if (result.code === 'TEMPORARY_FAILURE') return 'We could not save that update. Please try again shortly.';
  const options = result.projectOptions || result.activityOptions;
  return options?.length ? `${result.message} ${options.map((item, index) => `${index + 1}. ${'name' in item ? item.name : item.label}`).join(' ')}` : result.message;
}
function asResult(result: CanonicalFieldUpdateOutcome, extra: Pick<WhatsAppInboundResult, 'pending' | 'pendingMedia'> = {}): WhatsAppInboundResult {
  return { ...result, response: responseFor(result), ...extra };
}
function safeMedia(media: ProviderInboundMedia[] | undefined) {
  const preserved = (media || []).filter(item => opaqueReference.test(item.providerReference));
  const canonical: FieldMediaReference[] = preserved
    .filter(item => item.storageConfirmed && item.storageReference && opaqueReference.test(item.storageReference))
    .map(item => ({ kind: item.kind, reference: item.storageReference!, storageConfirmed: true }));
  return { preserved, canonical };
}

/** Deterministic extraction only: an explicit BOQ/WBS reference and a simple quantity/unit. */
export function parseInboundFieldUpdate(event: ProviderInboundWhatsAppEvent): Omit<CanonicalFieldUpdateInput, 'operationId' | 'source'> & { pendingMedia: ProviderInboundMedia[] } {
  const text = safeText(event.text);
  const wbs = text.match(/\b(?:boq|wbs)\s*(?:no\.?|#)?\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})\b/i)?.[1];
  const quantity = text.match(/\b(\d+(?:\.\d+)?)\s*(m2|m²|m3|m³|nos?|kg|tonnes?|m)\b/i);
  const media = safeMedia(event.media);
  return {
    wbsCode: wbs, quantity: quantity ? Number(quantity[1]) : undefined, unit: quantity?.[2],
    description: text || undefined, occurredAt: event.receivedAt, media: media.canonical, pendingMedia: media.preserved.filter(item => !item.storageConfirmed),
  };
}

function trustedContext(sender: VerifiedInboundSender, organization: InboundOrganizationContext): TrustedFieldUpdateContext {
  return { personId: sender.personId, organizationId: organization.organizationId, projects: organization.projects, communicationIdentity: organization.communicationIdentity };
}
function pending(event: ProviderInboundWhatsAppEvent, sender: VerifiedInboundSender, organizationId: string | undefined, question: PendingQuestion, input: Omit<CanonicalFieldUpdateInput, 'operationId' | 'source'>, options: Array<{ id: string; label: string }>): PendingConversationContext {
  return { id: `whatsapp-context:${event.provider}:${event.providerMessageId}`, provider: event.provider, originProviderMessageId: event.providerMessageId,
    lastProviderMessageId: event.providerMessageId, personId: sender.personId, organizationId, question, input, options,
    expiresAt: new Date(Date.parse(event.receivedAt) + CONTEXT_TTL_MS).toISOString(), state: 'pending' };
}
function organizationOptions(sender: VerifiedInboundSender) { return sender.organizations.map(item => ({ id: item.organizationId, label: item.organizationId })); }

async function callCanonical(event: ProviderInboundWhatsAppEvent, sender: VerifiedInboundSender, organization: InboundOrganizationContext, input: Omit<CanonicalFieldUpdateInput, 'operationId' | 'source'>, command: InboundCanonicalCommand) {
  return command.create({ ...input, operationId: operationId(event), source: 'WHATSAPP' }, trustedContext(sender, organization));
}

/**
 * Provider-neutral orchestration. The resolver and context store are server
 * adapters: inbound payload values never become trusted person/org/project data.
 */
export async function processInboundWhatsAppFieldUpdate(
  event: ProviderInboundWhatsAppEvent,
  dependencies: { resolveSender(address: string): Promise<InboundSenderResolution>; conversations: InboundConversationStore; command: InboundCanonicalCommand },
): Promise<WhatsAppInboundResult> {
  if (!event.provider || !event.providerMessageId || event.channel !== 'WHATSAPP' || !event.senderAddress || Number.isNaN(Date.parse(event.receivedAt))) {
    return asResult({ code: 'INVALID_INPUT', message: 'Unsupported inbound message.' });
  }
  const sender = await dependencies.resolveSender(event.senderAddress);
  if (sender.status !== 'verified') return asResult({ code: 'IDENTITY_NOT_VERIFIED', message: 'This WhatsApp sender is not a verified BuildTrack identity.' });
  if (await dependencies.conversations.findByMessage(event.provider, event.providerMessageId)) return asResult({ code: 'DUPLICATE', message: 'This message was already handled.' });

  const active = await dependencies.conversations.findActive(event.provider, sender.personId, event.receivedAt);
  if (active && safeText(event.text)) {
    const choice = selectIndex(safeText(event.text), active.options);
    if (choice) {
      const organization = active.question === 'organization'
        ? sender.organizations.find(item => item.organizationId === choice.id)
        : sender.organizations.find(item => item.organizationId === active.organizationId);
      if (!organization) return asResult({ code: 'UNAUTHORIZED', message: 'That saved project context is no longer authorized.' });
      const nextInput = active.question === 'project' ? { ...active.input, projectId: choice.id }
        : active.question === 'activity' ? { ...active.input, activityId: choice.id }
        : active.input;
      const result = await callCanonical(event, sender, organization, nextInput, dependencies.command);
      await dependencies.conversations.resolve(active.id, event.providerMessageId);
      return await persistClarification(event, sender, organization, nextInput, result, dependencies.conversations);
    }
  }

  const input = parseInboundFieldUpdate(event);
  if (!sender.organizations.length) return asResult({ code: 'UNAUTHORIZED', message: 'No authorized organization context is available.' }, { pendingMedia: input.pendingMedia });
  if (sender.organizations.length !== 1) {
    const context = pending(event, sender, undefined, 'organization', input, organizationOptions(sender));
    await dependencies.conversations.save(context);
    return asResult({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Choose your organization.', projectOptions: context.options.map(item => ({ id: item.id, name: item.label })) }, { pending: context, pendingMedia: input.pendingMedia });
  }
  const organization = sender.organizations[0];
  const result = await callCanonical(event, sender, organization, input, dependencies.command);
  return persistClarification(event, sender, organization, input, result, dependencies.conversations, input.pendingMedia);
}

async function persistClarification(event: ProviderInboundWhatsAppEvent, sender: VerifiedInboundSender, organization: InboundOrganizationContext, input: Omit<CanonicalFieldUpdateInput, 'operationId' | 'source'>, result: CanonicalFieldUpdateOutcome, conversations: InboundConversationStore, pendingMedia: ProviderInboundMedia[] = []) {
  const question = result.code === 'PROJECT_CONTEXT_REQUIRED' ? 'project' : result.code === 'ACTIVITY_AMBIGUOUS' || result.code === 'ACTIVITY_REQUIRED' ? 'activity' : null;
  if (!question) return asResult(result, { pendingMedia });
  const options = question === 'project'
    ? organization.projectLabels.map(item => ({ id: item.id, label: item.name }))
    : (result.activityOptions || []).map(item => ({ id: item.id, label: item.label }));
  const context = pending(event, sender, organization.organizationId, question, input, options);
  await conversations.save(context);
  return asResult({ ...result, projectOptions: question === 'project' ? context.options.map(item => ({ id: item.id, name: item.label })) : result.projectOptions,
    activityOptions: question === 'activity' ? context.options.map(item => ({ id: item.id, label: item.label })) : result.activityOptions }, { pending: context, pendingMedia });
}
