/**
 * Provider-neutral operational notification routing.
 *
 * Authorization answers whether somebody may use a feature. Responsibility
 * answers who owns/report to whom for a project. This module only answers who
 * should be informed about an already-authorized event; it never grants access
 * and it never delivers a message.
 */
export type NotificationSource = 'WEB' | 'MOBILE' | 'WHATSAPP' | 'FUTURE';
export type NotificationScope = 'project' | 'organization';

export type OperationalNotificationEvent = {
  id: string;
  type: string;
  organizationId: string;
  projectId?: string;
  actorPersonId?: string;
  recordId?: string;
  occurredAt: string;
  source: NotificationSource;
  scope: NotificationScope;
};

/** A person can report to a different supervisor for each project. */
export type ProjectReportingRelationship = {
  organizationId: string;
  projectId: string;
  personId: string;
  supervisorPersonId?: string;
  isProjectResponsible?: boolean;
  notificationsEnabled?: boolean;
};

export type ProjectNotificationMembership = {
  organizationId: string;
  projectId: string;
  personId: string;
  active: boolean;
};

/** Explicitly configured leadership recipients; leadership alone is not a subscription. */
export type OrganizationNotificationRecipient = {
  organizationId: string;
  personId: string;
  active: boolean;
  notificationsEnabled?: boolean;
  eventTypes?: string[];
};

export type NotificationRoutingContext = {
  projectMemberships: ProjectNotificationMembership[];
  reportingRelationships: ProjectReportingRelationship[];
  organizationRecipients: OrganizationNotificationRecipient[];
};

export type NotificationRecipientResolution =
  | { status: 'accepted'; recipientPersonIds: string[] }
  | { status: 'rejected'; reason: string };

export type PendingNotificationRecord = {
  id: string;
  eventId: string;
  organizationId: string;
  projectId?: string;
  recipientPersonId: string;
  actorPersonId?: string;
  recordId?: string;
  eventType: string;
  source: NotificationSource;
  channel: 'BUILDTRACK';
  status: 'pending';
  createdAt: string;
};

function isMemberOfProject(membership: ProjectNotificationMembership, event: OperationalNotificationEvent, personId: string) {
  return membership.active && membership.organizationId === event.organizationId && membership.projectId === event.projectId && membership.personId === personId;
}

function acceptsEvent(recipient: OrganizationNotificationRecipient, event: OperationalNotificationEvent) {
  return recipient.active && recipient.notificationsEnabled !== false && recipient.organizationId === event.organizationId &&
    (!recipient.eventTypes?.length || recipient.eventTypes.includes(event.type));
}

/**
 * Resolves recipients from trusted, server-authoritative membership snapshots.
 * Source is deliberately not used: WEB, MOBILE and a future approved provider
 * all produce the same recipient set for the same event context.
 */
export function resolveNotificationRecipients(event: OperationalNotificationEvent, context: NotificationRoutingContext): NotificationRecipientResolution {
  if (!event.id || !event.type || !event.organizationId || !event.occurredAt) {
    return { status: 'rejected', reason: 'The notification event is missing its required context.' };
  }
  if (event.scope === 'project' && !event.projectId) return { status: 'rejected', reason: 'A project event requires a project context.' };
  if (event.scope === 'organization' && event.projectId) return { status: 'rejected', reason: 'An organization event cannot use a project context.' };

  if (event.scope === 'project' && event.actorPersonId && !context.projectMemberships.some(member => isMemberOfProject(member, event, event.actorPersonId!))) {
    return { status: 'rejected', reason: 'The event actor is not an active member of the event project.' };
  }

  const recipients = new Set<string>();
  if (event.scope === 'project') {
    for (const relationship of context.reportingRelationships) {
      if (relationship.organizationId !== event.organizationId || relationship.projectId !== event.projectId || relationship.notificationsEnabled === false) continue;
      // The assigned project responsible receives actionable project events.
      if (relationship.isProjectResponsible && context.projectMemberships.some(member => isMemberOfProject(member, event, relationship.personId))) recipients.add(relationship.personId);
      // The actor's project-specific supervisor receives the actor's update.
      if (relationship.personId === event.actorPersonId && relationship.supervisorPersonId && context.projectMemberships.some(member => isMemberOfProject(member, event, relationship.supervisorPersonId!))) recipients.add(relationship.supervisorPersonId);
    }
  }

  for (const recipient of context.organizationRecipients) {
    if (acceptsEvent(recipient, event)) recipients.add(recipient.personId);
  }
  // The actor has the source record already; a notification is not a self-audit.
  if (event.actorPersonId) recipients.delete(event.actorPersonId);
  return { status: 'accepted', recipientPersonIds: [...recipients].sort() };
}

/** Create idempotent in-app notification records; persistence is a later adapter. */
export function buildPendingNotificationRecords(event: OperationalNotificationEvent, resolution: NotificationRecipientResolution): PendingNotificationRecord[] {
  if (resolution.status !== 'accepted') return [];
  return resolution.recipientPersonIds.map(recipientPersonId => ({
    id: `notification-${event.id}-${recipientPersonId}`,
    eventId: event.id,
    organizationId: event.organizationId,
    projectId: event.projectId,
    recipientPersonId,
    actorPersonId: event.actorPersonId,
    recordId: event.recordId,
    eventType: event.type,
    source: event.source,
    channel: 'BUILDTRACK',
    status: 'pending',
    createdAt: event.occurredAt,
  }));
}

/** Adapts the Phase 3B boundary without altering the canonical field-update model. */
export function fieldUpdateNotificationEvent(
  event: { type: 'field_update_created'; projectId: string; personId: string },
  context: { id: string; organizationId: string; occurredAt: string; source: NotificationSource; recordId?: string },
): OperationalNotificationEvent {
  return {
    id: context.id, type: event.type, projectId: event.projectId, actorPersonId: event.personId,
    organizationId: context.organizationId, occurredAt: context.occurredAt, source: context.source,
    recordId: context.recordId, scope: 'project',
  };
}
