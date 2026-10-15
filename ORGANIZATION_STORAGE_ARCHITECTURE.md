# Phase 3H organization-controlled storage foundation

The legacy `google_connections` table remains project-specific. Its OAuth
callback creates folders in the consenting Project Director's My Drive, so it
is classified as `PERSONAL_DRIVE`; it must never be presented as proof of
company ownership.

Phase 3H adds a provider-neutral future model:

`organization → organization_storage_connection → storage root → project folder`

`organization_storage_connections` records the provider, explicit ownership
classification, status, opaque root and optional Shared Drive ID, audit users,
and encrypted token only for server-side use. `organization_storage_project_folders`
maps the selected organization connection to a project folder. The resolver
uses an active connected organization destination first, then only that same
project's legacy Director connection; it never substitutes another user's Drive.

The current OAuth consent contains `drive.file`, which is suitable for the
legacy app-created-file flow but not safe Shared Drive discovery or write
verification. A future activation must seek narrowly justified Google consent
for Shared Drive metadata discovery, list accessible drives server-side, verify
write access against the selected root, mark it verified, and then create a
project folder. It must not infer ownership from the email domain.

No existing folders/files/references are moved in this phase. A future migration
must inventory legacy references, copy only after explicit organization
verification, reconcile references, validate reads, and retire old paths only
after a controlled confirmation period. OpenWA remains out of scope.
