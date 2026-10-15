import type { Feature } from './permissions';

// Existing use cases use existing capabilities; no new role or entitlement.
export const AI_USE_CASES = {
  tender: { feature: 'schedule', access: 'write' },
  daily_report: { feature: 'daily_reports', access: 'write' },
  delay: { feature: 'schedule', access: 'read' },
  recovery: { feature: 'schedule', access: 'read' },
  claim: { feature: 'claims', access: 'write' },
  summary: { feature: 'reports', access: 'read' },
} as const satisfies Record<string, { feature: Feature; access: 'read' | 'write' }>;
export type AiUseCase = keyof typeof AI_USE_CASES;
