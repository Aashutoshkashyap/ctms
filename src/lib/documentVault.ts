export const DOCUMENT_STATUSES = ['REQUESTED', 'IN_PROCESS', 'UNDER_REVIEW', 'APPROVED', 'COMPLETED', 'REJECTED', 'ARCHIVED'] as const;
export const DOCUMENT_SOURCES = ['WEB', 'MODULE', 'WHATSAPP', 'API'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];

export function fileExtension(name: string) {
  const value = name.trim().split('.').pop();
  return value && value !== name ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

export function previewKind(mimeType: string, name: string): 'image' | 'pdf' | 'audio' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || fileExtension(name) === 'pdf') return 'pdf';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function gregorianFolderDate(value?: string) {
  const candidate = value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : new Date().toISOString().slice(0, 10);
}

export function documentFolderSegments(input: { date?: string; module?: string; site?: string; task?: string }) {
  return [gregorianFolderDate(input.date), input.module || 'Documents', input.site || '', input.task || ''].filter(Boolean);
}

export function documentDepartment(role: string) {
  const normalized = role.replaceAll('_', ' ').toLowerCase();
  if (normalized.includes('account') || normalized.includes('billing')) return 'Finance';
  if (normalized.includes('store')) return 'Stores';
  if (normalized.includes('safety')) return 'HSE';
  if (normalized.includes('qa') || normalized.includes('quality')) return 'QA/QC';
  if (normalized.includes('design')) return 'Design';
  if (normalized.includes('site') || normalized.includes('field')) return 'Site';
  return 'Project Management';
}
