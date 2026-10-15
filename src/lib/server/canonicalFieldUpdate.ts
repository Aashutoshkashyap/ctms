import { evaluateFieldUpdate, type FieldMediaReference, type FieldUpdateActivity, type FieldUpdateCandidate, type FieldUpdateProjectContext, type FieldUpdateSource } from '../fieldUpdateIntake';
import { fieldUpdateNotificationEvent, type NotificationRoutingContext, resolveNotificationRecipients, buildPendingNotificationRecords } from '../notificationRouting';
import type { PairingState } from '../communicationIdentity';

export type FieldUpdateOutcomeCode =
  | 'ACCEPTED' | 'UNAUTHORIZED' | 'IDENTITY_NOT_VERIFIED' | 'PROJECT_CONTEXT_REQUIRED'
  | 'ORGANIZATION_CONTEXT_REQUIRED'
  | 'PROJECT_NOT_AUTHORIZED' | 'ACTIVITY_REQUIRED' | 'ACTIVITY_NOT_FOUND' | 'ACTIVITY_AMBIGUOUS'
  | 'INVALID_INPUT' | 'DUPLICATE' | 'CONFLICT' | 'TEMPORARY_FAILURE';

export type TrustedFieldUpdateContext = {
  personId: string;
  organizationId: string;
  projects: FieldUpdateProjectContext[];
  communicationIdentity?: { personId: string; organizationId: string; pairingState: PairingState } | null;
};

export type CanonicalFieldUpdateInput = {
  operationId: string;
  source: FieldUpdateSource;
  projectId?: string;
  activityId?: string;
  wbsCode?: string;
  occurredAt?: string;
  quantity?: number;
  unit?: string;
  description?: string;
  problem?: string;
  media?: FieldMediaReference[];
};

export type CanonicalFieldUpdateOutcome = {
  code: FieldUpdateOutcomeCode;
  message: string;
  recordId?: string;
  event?: { type: 'field_update_created'; projectId: string; personId: string };
  projectOptions?: Array<{ id: string; name: string }>;
  activityOptions?: Array<{ id: string; label: string }>;
};

export type ServerFieldUpdateOperation = { operationId: string; recordId?: string; outcome?: CanonicalFieldUpdateOutcome };
export type ServerFieldUpdateOperations = {
  find(operationId: string, organizationId: string): Promise<ServerFieldUpdateOperation | null>;
  claim(operationId: string, organizationId: string, personId: string, source: FieldUpdateSource): Promise<'claimed' | 'duplicate'>;
  complete(operationId: string, outcome: CanonicalFieldUpdateOutcome): Promise<void>;
  fail(operationId: string, message: string): Promise<void>;
};

/** The persistence implementation must enforce operationId uniqueness server-side. */
export type CanonicalFieldUpdatePersistence = {
  create(candidate: FieldUpdateCandidate, operationId: string): Promise<{ recordId: string }>;
};

export type CanonicalFieldUpdateEvents = {
  publish(event: { type: 'field_update_created'; projectId: string; personId: string }, candidate: FieldUpdateCandidate): Promise<void>;
  routing?: { context: NotificationRoutingContext; persist(records: ReturnType<typeof buildPendingNotificationRecords>): Promise<void> };
};

function outcome(code: FieldUpdateOutcomeCode, message: string, extra: Omit<CanonicalFieldUpdateOutcome, 'code' | 'message'> = {}): CanonicalFieldUpdateOutcome {
  return { code, message, ...extra };
}

function activeProjects(context: TrustedFieldUpdateContext) {
  return context.projects.filter(project => project.personId === context.personId && project.organizationId === context.organizationId && project.canSubmitDailyWork);
}

function activityOptions(activities: FieldUpdateActivity[]) {
  return activities.slice(0, 8).map(activity => ({ id: activity.id, label: `${activity.wbsCode} — ${activity.name}` }));
}

function verifiedInboundIdentity(context: TrustedFieldUpdateContext) {
  const identity = context.communicationIdentity;
  return Boolean(identity && identity.pairingState === 'VERIFIED' && identity.personId === context.personId && identity.organizationId === context.organizationId);
}

function hasValidPayload(input: CanonicalFieldUpdateInput) {
  if (!(['WEB', 'MOBILE', 'WHATSAPP', 'FUTURE'] as const).includes(input.source)) return false;
  if (input.quantity !== undefined && (!Number.isFinite(input.quantity) || input.quantity < 0)) return false;
  if (input.unit !== undefined && !input.unit.trim()) return false;
  if (input.occurredAt !== undefined && Number.isNaN(Date.parse(input.occurredAt))) return false;
  return input.media?.every(media => (
    (media.kind === 'photo' || media.kind === 'audio' || media.kind === 'document')
    && Boolean(media.reference?.trim())
    && media.storageConfirmed
  )) ?? true;
}

/**
 * Provider-neutral server command. Its context is built from authenticated
 * server reads; no caller identity, tenant, activity, or phone number enters
 * this function as a trusted value.
 */
export async function createCanonicalFieldUpdate(
  input: CanonicalFieldUpdateInput,
  context: TrustedFieldUpdateContext,
  operations: ServerFieldUpdateOperations,
  persistence: CanonicalFieldUpdatePersistence,
  events: CanonicalFieldUpdateEvents,
): Promise<CanonicalFieldUpdateOutcome> {
  if (!context.personId || !context.organizationId || !input.operationId || !input.source) return outcome('INVALID_INPUT', 'A valid authenticated update context is required.');
  if (!hasValidPayload(input)) return outcome('INVALID_INPUT', 'The update contains an invalid value or unconfirmed evidence reference.');
  const prior = await operations.find(input.operationId, context.organizationId);
  if (prior?.outcome) return { ...prior.outcome, code: 'DUPLICATE', message: 'This field update was already processed.' };
  // A retry only reads its previously stored result; verification remains
  // mandatory before claiming any new inbound operation.
  if (input.source === 'WHATSAPP' && !verifiedInboundIdentity(context)) return outcome('IDENTITY_NOT_VERIFIED', 'This communication identity is not verified.');
  if (await operations.claim(input.operationId, context.organizationId, context.personId, input.source) === 'duplicate') {
    const existing = await operations.find(input.operationId, context.organizationId);
    return existing?.outcome ? { ...existing.outcome, code: 'DUPLICATE', message: 'This field update was already processed.' } : outcome('CONFLICT', 'This field update is already being processed.');
  }

  try {
    const projects = activeProjects(context);
    let project: FieldUpdateProjectContext | undefined;
    if (input.projectId) {
      project = projects.find(item => item.projectId === input.projectId);
      if (!project) return await completed(operations, input.operationId, outcome('PROJECT_NOT_AUTHORIZED', 'The selected project is not available for this update.'));
    } else if (projects.length === 1) project = projects[0];
    else if (projects.length > 1) return await completed(operations, input.operationId, outcome('PROJECT_CONTEXT_REQUIRED', 'Choose the project for this update.', { projectOptions: projects.map(item => ({ id: item.projectId, name: item.projectId })) }));
    else return await completed(operations, input.operationId, outcome('UNAUTHORIZED', 'No authorized project context is available.'));

    const activities = project.activities;
    let activity: FieldUpdateActivity | undefined;
    if (input.activityId) {
      activity = activities.find(item => item.id === input.activityId);
      if (!activity) return await completed(operations, input.operationId, outcome('ACTIVITY_NOT_FOUND', 'The selected work item is not in this project.'));
    } else if (input.wbsCode) {
      const matches = activities.filter(item => item.wbsCode === input.wbsCode);
      if (!matches.length) return await completed(operations, input.operationId, outcome('ACTIVITY_NOT_FOUND', 'No work item matches that BOQ reference.'));
      if (matches.length > 1) return await completed(operations, input.operationId, outcome('ACTIVITY_AMBIGUOUS', 'Choose the intended work item.', { activityOptions: activityOptions(matches) }));
      activity = matches[0];
    } else if (input.quantity !== undefined) {
      return await completed(operations, input.operationId, outcome('ACTIVITY_REQUIRED', 'Choose a work item before reporting a quantity.', { activityOptions: activityOptions(activities) }));
    }

    const intake = evaluateFieldUpdate({
      personId: context.personId, organizationId: context.organizationId, source: input.source, projectId: project.projectId,
      activityId: activity?.id, wbsCode: activity?.wbsCode, occurredAt: input.occurredAt, quantity: input.quantity,
      unit: input.unit, description: input.description, problem: input.problem, media: input.media,
    }, { personId: context.personId, organizationId: context.organizationId, projects: [project] });
    if (intake.status === 'needs_clarification') return await completed(operations, input.operationId, outcome('ACTIVITY_AMBIGUOUS', intake.question, { projectOptions: intake.projectOptions, activityOptions: intake.activityOptions }));
    if (intake.status === 'rejected') return await completed(operations, input.operationId, outcome('INVALID_INPUT', intake.reason));

    const stored = await persistence.create(intake.candidate, input.operationId);
    await events.publish(intake.event, intake.candidate);
    if (events.routing) {
      const routedEvent = fieldUpdateNotificationEvent(intake.event, { id: input.operationId, organizationId: context.organizationId, occurredAt: intake.candidate.occurredAt, source: input.source, recordId: stored.recordId });
      await events.routing.persist(buildPendingNotificationRecords(routedEvent, resolveNotificationRecipients(routedEvent, events.routing.context)));
    }
    return await completed(operations, input.operationId, outcome('ACCEPTED', 'Field update recorded.', { recordId: stored.recordId, event: intake.event }));
  } catch {
    await operations.fail(input.operationId, 'The field update could not be completed.');
    return outcome('TEMPORARY_FAILURE', 'The field update could not be completed. Try again.');
  }
}

async function completed(operations: ServerFieldUpdateOperations, operationId: string, value: CanonicalFieldUpdateOutcome) {
  await operations.complete(operationId, value);
  return value;
}

/** Future adapters use this narrow verifier; a phone number alone is never sufficient. */
export function resolveVerifiedInboundPerson(identity: { personId: string; organizationId: string; pairingState: PairingState } | null) {
  return identity?.pairingState === 'VERIFIED' ? { personId: identity.personId, organizationId: identity.organizationId } : null;
}
