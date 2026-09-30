export type EvidenceSource = 'WEB' | 'MOBILE' | 'WHATSAPP' | 'FUTURE';
export type EvidenceMediaType = 'IMAGE' | 'AUDIO' | 'DOCUMENT';
export type EvidenceStorageProvider = 'SUPABASE_STORAGE' | 'GOOGLE_DRIVE' | 'WHATSAPP_PROVIDER' | 'FUTURE';
export type EvidenceStatus = 'PENDING' | 'INGESTED' | 'ATTACHED' | 'FAILED';

export type TrustedEvidenceContext = { personId: string; organizationId: string; projectId: string; canUploadEvidence: boolean };
export type EvidenceInput = {
  operationId: string; source: EvidenceSource; mediaType: EvidenceMediaType; storageProvider: EvidenceStorageProvider;
  providerObjectId: string; originalFilename?: string; mimeType?: string; sizeBytes?: number; capturedAt?: string;
};
export type EvidenceRecord = EvidenceInput & {
  id: string; personId: string; organizationId: string; projectId: string; status: EvidenceStatus;
  canonicalRecordId?: string; fieldUpdateOperationId?: string; errorCode?: string;
};
export type EvidenceOutcome = { code: 'ACCEPTED' | 'UNAUTHORIZED' | 'INVALID_INPUT' | 'DUPLICATE' | 'CONFLICT' | 'TEMPORARY_FAILURE'; message: string; evidence?: EvidenceRecord };
export type EvidenceStore = {
  find(organizationId: string, storageProvider: EvidenceStorageProvider, providerObjectId: string): Promise<EvidenceRecord | null>;
  create(record: EvidenceRecord): Promise<void>;
  update(id: string, change: Partial<Pick<EvidenceRecord, 'status' | 'canonicalRecordId' | 'fieldUpdateOperationId' | 'errorCode'>>): Promise<EvidenceRecord>;
};
export type CanonicalRecordResolver = { belongsToProject(recordId: string, projectId: string, organizationId: string): Promise<boolean> };

const opaqueObjectId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const sources = new Set<EvidenceSource>(['WEB', 'MOBILE', 'WHATSAPP', 'FUTURE']);
const mediaTypes = new Set<EvidenceMediaType>(['IMAGE', 'AUDIO', 'DOCUMENT']);
const providers = new Set<EvidenceStorageProvider>(['SUPABASE_STORAGE', 'GOOGLE_DRIVE', 'WHATSAPP_PROVIDER', 'FUTURE']);

function invalid(message: string): EvidenceOutcome { return { code: 'INVALID_INPUT', message }; }
function validInput(input: EvidenceInput) {
  return Boolean(input.operationId && sources.has(input.source) && mediaTypes.has(input.mediaType) && providers.has(input.storageProvider)
    && opaqueObjectId.test(input.providerObjectId) && (input.sizeBytes === undefined || (Number.isFinite(input.sizeBytes) && input.sizeBytes >= 0))
    && (input.capturedAt === undefined || !Number.isNaN(Date.parse(input.capturedAt))));
}

/** Server-side creation of a provider-neutral reference. URLs never enter this boundary. */
export async function createEvidenceReference(input: EvidenceInput, context: TrustedEvidenceContext, store: EvidenceStore): Promise<EvidenceOutcome> {
  if (!context.personId || !context.organizationId || !context.projectId || !context.canUploadEvidence) return { code: 'UNAUTHORIZED', message: 'Evidence upload is not authorized for this project.' };
  if (!validInput(input)) return invalid('The evidence reference is invalid.');
  const existing = await store.find(context.organizationId, input.storageProvider, input.providerObjectId);
  if (existing) return { code: 'DUPLICATE', message: 'This evidence item is already registered.', evidence: existing };
  const record: EvidenceRecord = { ...input, id: `evidence:${context.organizationId}:${input.storageProvider}:${input.providerObjectId}`, personId: context.personId, organizationId: context.organizationId, projectId: context.projectId, status: 'PENDING' };
  try { await store.create(record); return { code: 'ACCEPTED', message: 'Evidence reference is pending secure ingestion.', evidence: record }; }
  catch { return { code: 'TEMPORARY_FAILURE', message: 'The evidence reference could not be saved. Try again.' }; }
}

/** Storage adapters call this only after resolving the opaque provider object server-side. */
export async function markEvidenceIngested(record: EvidenceRecord, context: TrustedEvidenceContext, store: EvidenceStore): Promise<EvidenceOutcome> {
  if (!context.canUploadEvidence || record.organizationId !== context.organizationId || record.projectId !== context.projectId || record.personId !== context.personId) return { code: 'UNAUTHORIZED', message: 'Evidence ingestion is not authorized.' };
  if (record.status !== 'PENDING' && record.status !== 'FAILED') return { code: 'CONFLICT', message: 'Evidence is not awaiting ingestion.', evidence: record };
  try { return { code: 'ACCEPTED', message: 'Evidence ingested and awaiting attachment.', evidence: await store.update(record.id, { status: 'INGESTED', errorCode: undefined }) }; }
  catch { return { code: 'TEMPORARY_FAILURE', message: 'Evidence ingestion state could not be saved.', evidence: record }; }
}

/** An association is successful only when the canonical record is in the same tenant/project. */
export async function attachEvidenceToCanonicalRecord(record: EvidenceRecord, canonicalRecordId: string, context: TrustedEvidenceContext, store: EvidenceStore, records: CanonicalRecordResolver): Promise<EvidenceOutcome> {
  if (!context.canUploadEvidence || record.organizationId !== context.organizationId || record.projectId !== context.projectId) return { code: 'UNAUTHORIZED', message: 'Evidence attachment is not authorized.' };
  if (record.status !== 'INGESTED') return { code: 'CONFLICT', message: 'Evidence must be ingested before it can be attached.', evidence: record };
  if (!canonicalRecordId || !(await records.belongsToProject(canonicalRecordId, context.projectId, context.organizationId))) {
    try {
      const failed = await store.update(record.id, { status: 'FAILED', errorCode: 'CANONICAL_ASSOCIATION_RETRYABLE' });
      return { code: 'CONFLICT', message: 'Evidence could not be attached and remains retryable.', evidence: failed };
    } catch { return { code: 'TEMPORARY_FAILURE', message: 'Evidence remains ingested and can be retried.', evidence: record }; }
  }
  try { return { code: 'ACCEPTED', message: 'Evidence attached to the canonical field update.', evidence: await store.update(record.id, { status: 'ATTACHED', canonicalRecordId, errorCode: undefined }) }; }
  catch { return { code: 'TEMPORARY_FAILURE', message: 'Evidence remains ingested and can be retried.', evidence: record }; }
}
