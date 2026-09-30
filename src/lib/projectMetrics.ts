import { diffDays, type Activity } from './cpm';

type AmountRow = object;

const finite = (value: unknown) => typeof value === 'number' ? (Number.isFinite(value) ? value : 0) : Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));
const field = (row: AmountRow, key: string) => (row as Record<string, unknown>)[key];

export type ProjectProgressMetrics = { plannedProgress: number; actualProgress: number; scheduleVariance: number };
export type ProjectFinancialMetrics = {
  contractAmount: number;
  approvedVariationAmount: number;
  revisedContractAmount: number;
  expenseTotal: number;
  budgetActualCost: number;
  billedAmount: number;
  certifiedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
};

export function activityPlannedProgress(activity: Activity, currentDate: string) {
  if (!activity.baseline_start || !activity.baseline_finish || Number.isNaN(Date.parse(currentDate))) return 0;
  if (diffDays(currentDate, activity.baseline_start) > 0) return 0;
  if (diffDays(activity.baseline_finish, currentDate) >= 0) return 100;
  const duration = diffDays(activity.baseline_start, activity.baseline_finish);
  return clamp(duration > 0 ? (diffDays(activity.baseline_start, currentDate) / duration) * 100 : 0);
}

/** Quantity is the operational source of truth; completed is capped at 100%. */
export function activityActualProgress(activity: Activity) {
  if (activity.status === 'completed') return 100;
  const planned = finite(activity.planned_quantity);
  if (planned <= 0) return 0;
  return clamp((finite(activity.actual_quantity) / planned) * 100);
}

function weightedProgress(activities: Activity[], value: (activity: Activity) => number) {
  const valid = activities.filter(activity => Number.isFinite(finite(activity.weightage)) && finite(activity.weightage) > 0);
  if (!valid.length) return activities.length ? activities.reduce((sum, activity) => sum + value(activity), 0) / activities.length : 0;
  const totalWeight = valid.reduce((sum, activity) => sum + finite(activity.weightage), 0);
  return totalWeight > 0 ? valid.reduce((sum, activity) => sum + value(activity) * finite(activity.weightage), 0) / totalWeight : 0;
}

export function calculateProjectProgress(activities: Activity[], currentDate: string): ProjectProgressMetrics {
  const plannedProgress = clamp(weightedProgress(activities, activity => activityPlannedProgress(activity, currentDate)));
  const actualProgress = clamp(weightedProgress(activities, activityActualProgress));
  return { plannedProgress, actualProgress, scheduleVariance: actualProgress - plannedProgress };
}

function isApprovedVariation(row: AmountRow) {
  return field(row, 'type') === 'variation' && field(row, 'status') === 'approved';
}
function validExpense(row: AmountRow) { return field(row, 'status') !== 'rejected'; }
function validIpc(row: AmountRow) { return field(row, 'status') !== 'cancelled'; }

/**
 * Monetary streams remain deliberately separate: daily expenses are not
 * budget-head actual costs, and claimed/certified/paid IPC amounts are not
 * interchangeable. Payment rows are authoritative when supplied.
 */
export function calculateProjectFinancials(input: {
  contractAmount?: unknown;
  claims?: AmountRow[];
  expenses?: AmountRow[];
  budgetHeads?: AmountRow[];
  ipcSubmissions?: AmountRow[];
  ipcPayments?: AmountRow[];
}): ProjectFinancialMetrics {
  const contractAmount = finite(input.contractAmount);
  const claims = input.claims || [];
  const ipcSubmissions = (input.ipcSubmissions || []).filter(validIpc);
  const approvedVariationAmount = claims.filter(isApprovedVariation).reduce((sum, claim) => sum + finite(field(claim, 'cost_impact_amount')), 0);
  const certifiedAmount = ipcSubmissions.reduce((sum, ipc) => sum + finite(field(ipc, 'certified_amount')), 0);
  const paidFromRows = (input.ipcPayments || []).reduce((sum, payment) => sum + finite(field(payment, 'amount')), 0);
  const paidAmount = input.ipcPayments?.length
    ? paidFromRows
    : ipcSubmissions.reduce((sum, ipc) => sum + finite(field(ipc, 'paid_amount')), 0);
  const netCertified = ipcSubmissions.reduce((sum, ipc) => sum + Math.max(0, finite(field(ipc, 'certified_amount')) - finite(field(ipc, 'retention_deducted')) - finite(field(ipc, 'advance_recovered'))), 0);
  return {
    contractAmount,
    approvedVariationAmount,
    revisedContractAmount: contractAmount + approvedVariationAmount,
    expenseTotal: (input.expenses || []).filter(validExpense).reduce((sum, expense) => sum + finite(field(expense, 'amount')), 0),
    budgetActualCost: (input.budgetHeads || []).reduce((sum, budget) => sum + finite(field(budget, 'actual_cost')), 0),
    billedAmount: ipcSubmissions.reduce((sum, ipc) => sum + finite(field(ipc, 'claimed_amount')), 0),
    certifiedAmount,
    paidAmount,
    outstandingAmount: Math.max(0, netCertified - paidAmount),
  };
}

export function sumBudgetValues(budgetHeads: AmountRow[]) {
  return {
    contractValue: budgetHeads.reduce((sum, row) => sum + finite(field(row, 'contract_value')), 0),
    internalBudget: budgetHeads.reduce((sum, row) => sum + finite(field(row, 'internal_budget')), 0),
    actualCost: budgetHeads.reduce((sum, row) => sum + finite(field(row, 'actual_cost')), 0),
    committedCost: budgetHeads.reduce((sum, row) => sum + finite(field(row, 'committed_cost')), 0),
  };
}
