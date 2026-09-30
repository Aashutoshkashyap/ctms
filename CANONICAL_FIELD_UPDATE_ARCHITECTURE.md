# Phase 3E canonical field-update command

`src/lib/server/canonicalFieldUpdate.ts` is the provider-neutral server command boundary. It consumes a trusted server context, never a caller-supplied person or tenant. WEB, MOBILE, and a future approved inbound adapter submit the same `CanonicalFieldUpdateInput` and receive the same machine-readable result contract.

The existing `dailyWorkUpdate.ts` browser flow remains intact. Its Phase 1B `DurableMutationOutbox` is browser-local and cannot safely acknowledge or replay a provider inbound request. Phase 3E therefore prepares `field_update_operations`: a minimal server idempotency ledger keyed by organization and stable operation key. A future provider uses its message/event ID as that key. It is not a competing client queue.

The command reuses Phase 3B's candidate and `field_update_created` event. It requires explicit project context when a verified person has multiple authorized projects, rejects foreign activities, never creates WBS items, and treats financial wording as unstructured description only. After canonical persistence, it emits the existing event and optionally routes recipient records through Phase 3C; source does not change recipient authorization.

The prepared Phase 3E SQL is intentionally unapplied. A future server persistence adapter must make canonical-record creation idempotent by operation key before enabling any real inbound provider. No OpenWA webhook, messages, media, QR/session, or outbound delivery is enabled here.
