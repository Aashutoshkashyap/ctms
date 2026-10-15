# Canonical flexible field-update intake

`FlexibleFieldUpdateInput` is the provider-neutral boundary for WEB, MOBILE, WHATSAPP and later channels. It holds a BuildTrack Person ID, authorized tenant/project context, optional canonical activity/WBS reference, text, issue, quantity/unit, event time, and already-stored media references.

`evaluateFieldUpdate()` never interprets free text with AI and never trusts a phone number. A future server endpoint must derive `FieldUpdateAuthorizationContext` from authenticated BuildTrack Person ID, organization/project membership, and `daily_reports` permission before calling `submitFieldUpdate()`.

The result is one of:

- `accepted`: creates a provider-neutral `field_update_created` event for the BuildTrack event/notification layer.
- `needs_clarification`: exposes one concise project/work question and human-readable BOQ options.
- `rejected`: authorization or canonical project/activity violation.

No payment, expense, IPC, or approval record can be produced by this boundary. No media upload occurs here; `photo`, `audio`, and `document` values are references only and must be storage-confirmed by the existing evidence system first.

Multi-project people are never assigned an arbitrary project. An explicit project, a uniquely matching activity, or exactly one authorized project is required. WhatsApp/OpenWA remains a future adapter into this command, not an alternative domain model.
