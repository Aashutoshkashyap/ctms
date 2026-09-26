export type DocumentStatus = 'draft' | 'under_review' | 'approved' | 'rejected';

const statuses = new Set<DocumentStatus>(['draft', 'under_review', 'approved', 'rejected']);
const transitions: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ['under_review'], under_review: ['approved', 'rejected'], approved: [], rejected: ['under_review'],
};

export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return typeof value === 'string' && statuses.has(value as DocumentStatus);
}

export function canTransitionDocument(from: DocumentStatus, to: DocumentStatus) {
  return transitions[from].includes(to);
}

export function validDocumentDate(value: unknown) {
  return value === null || value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function cleanDocumentText(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
