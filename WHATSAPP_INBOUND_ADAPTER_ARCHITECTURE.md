# Phase 3F inbound adapter boundary

`whatsappInboundFieldUpdate.ts` receives a normalized provider event, resolves a
verified BuildTrack person through a server-owned resolver, and calls the Phase
3E canonical command. It never treats a phone number, sender name, incoming
organization, project, activity, or media URL as trusted authorization data.

One pending clarification can be stored per inbound interaction in
`field_update_conversation_contexts`. It contains only the unprocessed intake
candidate, safe option IDs, expiry, and the last provider message ID. Every
selection re-resolves the sender and current authorized memberships before it
re-enters the canonical command.

Provider media references are accepted only as opaque IDs. They are preserved
as pending evidence metadata, but are deliberately not marked as canonical
storage evidence until a future secure media-ingestion adapter confirms storage.
OpenWA remains disabled by `WHATSAPP_ENABLED !== 'true'`; outbound delivery,
session/QR management, transcription, AI parsing, and Google Drive ingestion
remain deferred.
