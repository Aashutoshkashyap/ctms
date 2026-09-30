# Phase 3I OpenWA production-readiness boundary

OpenWA is a transport adapter, never a BuildTrack authority. The raw webhook
requires two server-only activation switches, HMAC verification, bounded JSON,
and an opaque provider event identifier. It discards provider-provided tenant,
project, user, and authorization metadata. It makes no domain-table writes.

The canonical route remains `OpenWA event → normalized inbound event → verified
communication identity → Phase 3F context → Phase 3E canonical command → Phase
3G evidence reference → Phase 3C routing`. The Phase 3E operation key
`whatsapp:openwa:<provider-event-id>` is the durable idempotency basis for
canonical updates. Conversation contexts provide duplicate protection for
clarifications. Unknown, unverified, revoked, malformed, stale, or ambiguous
events are rejected or require clarification and do not retry as field updates.

`openwa_provider_configurations` is organization-scoped and stores only safe
configuration metadata plus an opaque secret reference. Actual webhook secrets,
session credentials, and activation switches remain server environment values.
Browser administrators can prepare/disable a configuration but cannot enable
transport or submit secrets. In-app notifications remain independent; outbound
WhatsApp delivery is explicitly `PENDING_UNSUPPORTED` until a later phase.

No WhatsApp account, QR/session, webhook registration, provider media download,
outbound message, or Google Drive behavior is enabled in this phase.
