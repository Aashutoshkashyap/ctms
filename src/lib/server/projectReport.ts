import { calculateProjectFinancialSummary, type FinancialRow } from '../financialMetrics';
import { escapeReportHtml } from '../reportSafety';

export const REPORT_TYPES = ['daily', 'weekly', 'monthly', 'ipc', 'claims', 'quality', 'safety', 'handover'] as const;
export type ReportType = typeof REPORT_TYPES[number];
export type ScopedRow = Record<string, unknown>;

export function parseReportType(value: string | null): ReportType | null {
  return REPORT_TYPES.includes(value as ReportType) ? value as ReportType : null;
}

export function validReportDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export function rowsForReportScope(rows: ScopedRow[], organizationId: string, projectId: string): ScopedRow[] {
  return rows.filter(row => row.organization_id === organizationId && row.project_id === projectId);
}

const label = (type: ReportType) => ({ daily: 'Daily Site Report Register', weekly: 'Weekly Lookahead Plan', monthly: 'Monthly Progress Report', ipc: 'IPC Support File', claims: 'Variation and EOT Support Report', quality: 'QA/QC Dossier', safety: 'Safety and EHS Report', handover: 'Handover Dossier' } as Record<ReportType, string>)[type];
const value = (row: ScopedRow, key: string) => row[key] ?? '—';
const table = (rows: unknown[][]) => !rows.length || rows.length === 1
  ? '<p>No records are available for this report.</p>'
  : `<table><thead><tr>${rows[0].map(cell => `<th>${escapeReportHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${escapeReportHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

export function buildProjectReport(input: {
  type: ReportType;
  project: ScopedRow;
  organizationId: string;
  projectId: string;
  generatedAt: string;
  dailyReports: ScopedRow[];
  activities: ScopedRow[];
  ipcRows: ScopedRow[];
  commercialRows: ScopedRow[];
  qualityRows: ScopedRow[];
  safetyRows: ScopedRow[];
  handoverRows: ScopedRow[];
  expenseRows: ScopedRow[];
}) {
  const scoped = (rows: ScopedRow[]) => rowsForReportScope(rows, input.organizationId, input.projectId);
  const dailyReports = scoped(input.dailyReports); const activities = scoped(input.activities); const ipcRows = scoped(input.ipcRows);
  const commercialRows = scoped(input.commercialRows); const qualityRows = scoped(input.qualityRows); const safetyRows = scoped(input.safetyRows);
  const handoverRows = scoped(input.handoverRows); const expenseRows = scoped(input.expenseRows);
  const financials = calculateProjectFinancialSummary({ contractAmount: input.project.contract_amount, commercialRecords: commercialRows as FinancialRow[], ipcRows: ipcRows as FinancialRow[], expenseRows: expenseRows as FinancialRow[] });
  let rows: unknown[][];
  if (input.type === 'daily') rows = [['Date', 'Weather', 'Manpower', 'Equipment', 'Obstruction'], ...dailyReports.map(row => [value(row, 'report_date'), value(row, 'weather'), value(row, 'manpower_total'), value(row, 'equipment_total'), value(row, 'obstruction_reasons')])];
  else if (input.type === 'weekly' || input.type === 'monthly') rows = [['BOQ item', 'Description of work', 'Status', 'Actual qty', 'Planned qty'], ...activities.map(row => [value(row, 'wbs_code'), value(row, 'name'), value(row, 'status'), value(row, 'actual_quantity'), value(row, 'planned_quantity')])];
  else if (input.type === 'ipc') rows = [['IPC', 'Claimed', 'Certified', 'Retention', 'Advance recovery', 'Net payable', 'Paid', 'Outstanding', 'Status'], ...ipcRows.map(row => [value(row, 'ipc_number'), value(row, 'claimed_amount'), value(row, 'certified_amount'), value(row, 'retention_deducted'), value(row, 'advance_recovered'), '', value(row, 'paid_amount'), '', value(row, 'status')])];
  else if (input.type === 'claims') rows = [['Reference', 'Title', 'Notice date', 'Time impact', 'Cost impact', 'Status'], ...commercialRows.map(row => [value(row, 'reference_id'), value(row, 'title'), value(row, 'notice_date'), value(row, 'time_impact_days'), value(row, 'cost_impact_amount'), value(row, 'workflow_status')])];
  else if (input.type === 'quality') rows = [['Inspection / test', 'Date', 'Status', 'NCR', 'Result'], ...qualityRows.map(row => [value(row, 'qa_item'), value(row, 'inspection_date'), value(row, 'status'), value(row, 'ncr_number'), value(row, 'test_result_details')])];
  else if (input.type === 'safety') rows = [['Date', 'Toolbox talks', 'Incidents', 'Near misses', 'Permits'], ...safetyRows.map(row => [value(row, 'log_date'), value(row, 'toolbox_talks'), value(row, 'incidents'), value(row, 'near_misses'), value(row, 'permits_issued')])];
  else rows = [['Item', 'Category', 'Status', 'Approved by', 'Approved date'], ...handoverRows.map(row => [value(row, 'item_name'), value(row, 'category'), value(row, 'status'), value(row, 'approved_by'), value(row, 'approved_date')])];
  if (input.type === 'ipc') {
    rows.splice(1, 0, ['Totals', financials.claimedAmount, financials.certifiedAmount, financials.retentionAmount, financials.advanceRecoveryAmount, financials.netPayableAmount, financials.paidAmount, financials.outstandingAmount, 'Canonical']);
  }
  const title = label(input.type);
  const metrics = `<section class="metrics"><span>Contract ${escapeReportHtml(financials.contractAmount)}</span><span>Approved variation ${escapeReportHtml(financials.approvedVariationAmount)}</span><span>Revised value ${escapeReportHtml(financials.revisedContractAmount)}</span><span>Expenses ${escapeReportHtml(financials.expenseTotal)}</span></section>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReportHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:28px;max-width:1100px;margin:auto;color:#172033}h1{color:#17365d}table{border-collapse:collapse;width:100%;margin:18px 0;font-size:13px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#eaf0f7}.metrics{display:flex;gap:8px;flex-wrap:wrap}.metrics span{padding:8px;background:#eef3f8;border-radius:6px}</style></head><body><h1>${escapeReportHtml(value(input.project, 'name'))}</h1><p>${escapeReportHtml(title)} · Generated ${escapeReportHtml(input.generatedAt)}</p>${metrics}${table(rows)}</body></html>`;
  return { title, rows, html, financials, generatedAt: input.generatedAt, type: input.type, project: { id: input.projectId, name: value(input.project, 'name') } };
}
