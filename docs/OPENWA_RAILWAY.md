# OpenWA on Railway

CTMS remains a Vercel-hosted Next.js application. OpenWA is a separate, Docker-hosted service and must not be added to CTMS `package.json`, development commands, or Vercel build configuration.

1. Deploy a pinned OpenWA release from the upstream [OpenWA repository](https://github.com/rmyndharis/OpenWA) to one Railway service.
2. Attach a persistent Railway volume for OpenWA's database and WhatsApp session directories. Do not use ephemeral storage and do not run multiple replicas against one session volume.
3. Create a session-scoped OpenWA operator API key, limited to CTMS-created sessions. Store it only as `OPENWA_API_KEY` in Vercel server environment variables.
4. Configure `OPENWA_BASE_URL`, `OPENWA_API_KEY`, `OPENWA_WEBHOOK_SECRET`, and optionally `OPENWA_REQUEST_TIMEOUT_MS` in Vercel. None may use a `NEXT_PUBLIC_` prefix.
5. Configure OpenWA's webhook to `https://<ctms-domain>/api/webhooks/openwa`, using the same HMAC secret and timestamp/signature headers expected by CTMS (`x-openwa-timestamp`, `x-openwa-signature`). Keep the OpenWA endpoint HTTPS-only and API-key protected.
6. Do not expose the OpenWA dashboard/API publicly without authentication or use the CTMS organization connection as a credential to access OpenWA directly.

The Company Admin Settings panel is the only CTMS pairing surface. QR values are passed transiently to an authorized Company Admin and are never stored in Supabase or application logs. B6 handles inbound-message metadata and internal CTMS notifications only: no outbound automation, replies, inbox, AI, or business-state commands are enabled.
