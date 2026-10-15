# Phase 3D communication identity foundation

`auth.users.id` remains the sole BuildTrack Person ID. `communication_identities` is an optional, tenant-scoped association to that person; it neither authenticates a caller nor grants a project permission.

The initial channel is `WHATSAPP` with provider `GENERIC`. `normalizeNepalWhatsAppNumber` accepts only explicit Nepal mobile representations and persists canonical `+9779[78]XXXXXXXX` values. The active-address and active-person partial unique indexes prevent duplicate active mappings within an organization while allowing a legitimate mapping in another tenant.

Administrators can create only a `PENDING` pairing and can revoke or remove it. Verification is intentionally deferred to an approved future provider adapter, which must supply verified metadata. A `VERIFIED` identity can identify only a potential person; later inbound processing must resolve their authorized project contexts and reject ambiguity when a person belongs to multiple projects.

The existing staff-management UI is not expanded in Phase 3D. The server-only `/api/admin/communication-identities` boundary provides masked status, pairing initiation, revocation, and removal after the existing `manage_users` authorization gate. It writes a small `app_notifications` audit entry for initiation/revocation/removal. No phone numbers are returned by broad client listings.

No OpenWA configuration, webhook, messages, media, outbound notifications, QR/session management, or verification implementation is added by this phase.
