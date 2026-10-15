# WhatsApp / OpenWA adapter contract

BuildTrack is canonical. Web/mobile already calls `saveDailyWorkUpdate()`; a future OpenWA adapter must call the server-safe equivalent of that command rather than write `daily_reports` or `daily_work_items` directly.

```
Web/mobile ───────────────┐
                           ├─ Canonical Daily Work Update command ─ daily_reports + daily_work_items
OpenWA webhook (future) ──┘
```

The current route is intentionally disabled unless `WHATSAPP_ENABLED=true`, verifies an HMAC signature, normalizes provider input, and rejects every sender because no verified mapping exists.

## Required data/security work before activation

1. A reviewed, tenant-scoped mapping for `whatsapp_number -> auth.users.id`; numbers must be verified and never inferred from a payload.
2. A durable, tenant-scoped inbound idempotency store keyed by `(provider, provider_message_id)`.
3. A durable outbound outbox with pending/sending/sent/failed state and delivery audit fields.
4. A server-safe Daily Work Update command which uses verified user, project membership, and activity scope. The Phase 2D browser-storage command is not suitable for webhook execution.
5. An identity resolver that returns all accessible projects; when there is more than one, a future deterministic conversation must establish explicit project and activity context.

Media references may represent image, audio/voice, or document. They must be attached to the same canonical update; no transcription, OCR, or AI processing is part of this architecture.

Configuration: `WHATSAPP_ENABLED`, `WHATSAPP_OPENWA_ENDPOINT`, `WHATSAPP_OPENWA_API_KEY`, `WHATSAPP_OPENWA_WEBHOOK_SECRET`, and optional `WHATSAPP_OPENWA_SIGNATURE_HEADER`. Missing configuration leaves the web application unaffected.
