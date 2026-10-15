export type DailyReportUpdateCode = 'UPDATED' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'CONFLICT' | 'VALIDATION_ERROR' | 'PERSISTENCE_ERROR';

export type DailyReportPatch = {
  id: string;
  report_date: string;
  weather?: string;
  manpower_total?: number;
  equipment_total?: number;
  site_instructions?: string;
  obstruction_reasons?: string;
  next_day_plan?: string;
  submitted_by?: string;
  submitted_by_email?: string;
};

export type DailyReportUpdateRequest = {
  organizationId: string;
  projectId: string;
  actorId: string;
  operationId: string;
  expectedRevision: number;
  report: DailyReportPatch;
};

export type DailyReportUpdateOutcome = {
  code: DailyReportUpdateCode;
  message: string;
  revision?: number;
  record?: Record<string, unknown>;
};

export type DailyReportConcurrencyPersistence = {
  apply(input: DailyReportUpdateRequest): Promise<DailyReportUpdateOutcome>;
};

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : undefined;
const count = (value: unknown) => value === undefined ? undefined : Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000 ? Number(value) : null;

/**
 * Normalizes the only report fields the conditional database command may
 * update. Scope, revision, identity and operation metadata never come from
 * this patch.
 */
export function normalizeDailyReportPatch(value: unknown): DailyReportPatch | null {
  if (!value || typeof value !== 'object') return null;
  const report = value as Record<string, unknown>;
  const id = text(report.id, 160);
  const report_date = text(report.report_date, 10);
  const manpower_total = count(report.manpower_total);
  const equipment_total = count(report.equipment_total);
  if (!id || !report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date) || manpower_total === null || equipment_total === null) return null;
  return {
    id, report_date, ...(text(report.weather, 120) !== undefined ? { weather: text(report.weather, 120) } : {}),
    ...(manpower_total !== undefined ? { manpower_total } : {}), ...(equipment_total !== undefined ? { equipment_total } : {}),
    ...(text(report.site_instructions, 4000) !== undefined ? { site_instructions: text(report.site_instructions, 4000) } : {}),
    ...(text(report.obstruction_reasons, 4000) !== undefined ? { obstruction_reasons: text(report.obstruction_reasons, 4000) } : {}),
    ...(text(report.next_day_plan, 4000) !== undefined ? { next_day_plan: text(report.next_day_plan, 4000) } : {}),
    ...(text(report.submitted_by, 180) !== undefined ? { submitted_by: text(report.submitted_by, 180) } : {}),
    ...(text(report.submitted_by_email, 254) !== undefined ? { submitted_by_email: text(report.submitted_by_email, 254) } : {}),
  };
}

export function validateDailyReportUpdate(input: DailyReportUpdateRequest): DailyReportUpdateOutcome | null {
  if (!input.organizationId || !input.projectId || !input.actorId || !input.operationId || input.operationId.length > 200) return { code: 'VALIDATION_ERROR', message: 'A complete authenticated update context is required.' };
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) return { code: 'VALIDATION_ERROR', message: 'The report revision is invalid.' };
  if (!normalizeDailyReportPatch(input.report)) return { code: 'VALIDATION_ERROR', message: 'The daily report contains invalid fields.' };
  return null;
}

/** The persistence adapter is server-only and must perform the compare-and-set atomically. */
export async function conditionallyUpdateDailyReport(input: DailyReportUpdateRequest, persistence: DailyReportConcurrencyPersistence): Promise<DailyReportUpdateOutcome> {
  const validation = validateDailyReportUpdate(input);
  if (validation) return validation;
  try {
    return await persistence.apply({ ...input, report: normalizeDailyReportPatch(input.report)! });
  } catch {
    return { code: 'PERSISTENCE_ERROR', message: 'The daily report could not be saved to the project database.' };
  }
}
