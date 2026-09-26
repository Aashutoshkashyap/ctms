/**
 * Canonical, presentation-safe financial arithmetic.
 *
 * This module intentionally aggregates records supplied by an already-authorized
 * caller. It does not fetch data or make authorization decisions.
 */
export type FinancialRow = object;
const field = (row: FinancialRow, key: string): unknown => (row as Record<string, unknown>)[key];

export function roundMoney(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Financial values must be finite and non-negative.');
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function nonNegativeAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount >= 0 ? roundMoney(amount) : 0;
}

export function nonNegativeNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function sumAmounts(rows: FinancialRow[], field: string): number {
  return roundMoney(rows.reduce((total, row) => total + nonNegativeAmount((row as Record<string, unknown>)[field]), 0));
}

export function calculateBoqValue(quantity: unknown, rate: unknown): number {
  return roundMoney(nonNegativeNumber(quantity) * nonNegativeAmount(rate));
}

export function calculateIpcNetPayable(row: FinancialRow): number {
  const certified = nonNegativeAmount(field(row, 'certified_amount'));
  const deductions = nonNegativeAmount(field(row, 'retention_deducted')) + nonNegativeAmount(field(row, 'advance_recovered'));
  return roundMoney(Math.max(0, certified - deductions));
}

export function calculateIpcOutstanding(row: FinancialRow): number {
  return roundMoney(Math.max(0, calculateIpcNetPayable(row) - nonNegativeAmount(field(row, 'paid_amount'))));
}

export function calculateIpcFinancialSummary(rows: FinancialRow[]) {
  const activeRows = rows.filter(row => field(row, 'status') !== 'rejected' && field(row, 'status') !== 'cancelled');
  const claimedAmount = sumAmounts(activeRows, 'claimed_amount');
  const certifiedAmount = sumAmounts(activeRows, 'certified_amount');
  const retentionAmount = sumAmounts(activeRows, 'retention_deducted');
  const advanceRecoveryAmount = sumAmounts(activeRows, 'advance_recovered');
  const netPayableAmount = roundMoney(activeRows.reduce((total, row) => total + calculateIpcNetPayable(row), 0));
  const paidAmount = sumAmounts(activeRows, 'paid_amount');
  const outstandingAmount = roundMoney(activeRows.reduce((total, row) => total + calculateIpcOutstanding(row), 0));
  return { claimedAmount, certifiedAmount, retentionAmount, advanceRecoveryAmount, netPayableAmount, paidAmount, outstandingAmount };
}

export function approvedVariationAmount(rows: FinancialRow[]): number {
  return roundMoney(rows
    .filter(row => field(row, 'type') === 'variation' && (field(row, 'workflow_status') === 'approved' || field(row, 'status') === 'approved'))
    .reduce((total, row) => total + nonNegativeAmount(field(row, 'cost_impact_amount') ?? field(row, 'amount')), 0));
}

export function calculateProjectFinancialSummary(input: {
  contractAmount: unknown;
  commercialRecords?: FinancialRow[];
  ipcRows?: FinancialRow[];
  expenseRows?: FinancialRow[];
}) {
  const contractAmount = nonNegativeAmount(input.contractAmount);
  const approvedVariation = approvedVariationAmount(input.commercialRecords || []);
  const ipc = calculateIpcFinancialSummary(input.ipcRows || []);
  const expenseTotal = sumAmounts(input.expenseRows || [], 'amount');
  return {
    contractAmount,
    approvedVariationAmount: approvedVariation,
    revisedContractAmount: roundMoney(contractAmount + approvedVariation),
    expenseTotal,
    ...ipc,
  };
}
