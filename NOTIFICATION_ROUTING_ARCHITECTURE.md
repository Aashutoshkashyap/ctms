# Phase 3C notification-routing foundation

BuildTrack keeps three decisions separate:

- **Authorization** remains the existing Phase 1A project/tenant capability gate.
- **Responsibility** is represented by a project-specific reporting relationship. A person can have a different supervisor and responsibility assignment in every project.
- **Notification** is an explicit routing decision. Read access does not subscribe someone to events, and an explicitly configured company recipient does not gain project-record access.

## Flow

`BuildTrack event -> resolveNotificationRecipients -> app_notifications recipient record -> future delivery adapter`

`src/lib/notificationRouting.ts` is deliberately pure. A future server command must obtain memberships, reporting relationships, and company recipients from authorized server-side reads before it invokes the resolver. UI components and providers do not select recipients.

The Phase 3B `field_update_created` boundary adapts through `fieldUpdateNotificationEvent`. `WEB`, `MOBILE`, and the reserved `WHATSAPP` source are only provenance values; they do not alter resolution. There is no WhatsApp activation, identity lookup, queue, pairing, webhook, or delivery in this phase.

## Persistence and privacy

The additive migration uses the existing `app_notifications` table for recipient-targeted in-app records. A deterministic `(event_id, recipient_person_id, delivery_channel)` uniqueness index supports safe retries. Legacy project-wide records remain readable to project members. New recipient-specific records are readable only by the addressed identity, and their existence never grants access to the underlying project record.

Company-wide recipients are explicit active leadership memberships in `organization_notification_recipients`; no role automatically subscribes a person. Project recipients are active members of the event's project. The resolver rejects an event whose actor is not an active member of that exact organization/project.
