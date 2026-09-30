# Phase 3G evidence boundary

Existing uploads use project-scoped Supabase Storage buckets or Google Drive.
The Google connection is server-authorized and tokens are encrypted, but its
OAuth `drive.file` flow creates files in the consenting account's Drive. It has
no Shared Drive selection or organization-owned storage proof today.

`evidence_media` is the new canonical, provider-neutral metadata ledger.
It stores tenant/project/uploader ownership, opaque object IDs, media metadata,
and `PENDING → INGESTED → ATTACHED` state. A storage URL is never accepted as
an authorization mechanism. Failed canonical association moves an ingested item
to a retryable `FAILED` state instead of claiming attachment success.

The current browser upload flows remain operational and are not migrated in
this phase. Future server adapters must create ledger references, securely
ingest/download provider media, then attach it through the canonical command.
Shared Drive/company-controlled OAuth selection, provider downloads, signed
evidence reads, and OpenWA activation remain deferred.
