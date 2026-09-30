export type PayrollPeriodStatus = 'draft' | 'open' | 'review' | 'approved' | 'finalized';
export type PayrollInputKind = 'allowance' | 'overtime' | 'other_earning' | 'tax' | 'other_deduction' | 'leave_adjustment';
export type PayrollInput = { kind: PayrollInputKind; amount: number; status: 'draft' | 'approved' | 'rejected'; description?: string };

export function validPeriodTransition(from: PayrollPeriodStatus, to: PayrollPeriodStatus) {
  return ({ draft: ['open'], open: ['review'], review: ['approved','open'], approved: ['finalized','review'], finalized: [] } as Record<PayrollPeriodStatus, PayrollPeriodStatus[]>)[from].includes(to);
}
export function calculatePayroll(baseSalary: number, inputs: PayrollInput[]) {
  if (!Number.isFinite(baseSalary) || baseSalary < 0) throw new Error('Base salary must be a non-negative amount.');
  const approved = inputs.filter(input => input.status === 'approved');
  for (const input of approved) if (!Number.isFinite(input.amount) || input.amount < 0) throw new Error('Payroll inputs must be non-negative amounts.');
  const total = (kinds: PayrollInputKind[]) => approved.filter(input => kinds.includes(input.kind)).reduce((sum, input) => sum + input.amount, 0);
  const allowances = total(['allowance']); const overtime = total(['overtime']); const otherEarnings = total(['other_earning']); const leaveAdjustment = total(['leave_adjustment']);
  const tax = total(['tax']); const otherDeductions = total(['other_deduction']);
  const grossEarnings = baseSalary + allowances + overtime + otherEarnings;
  const totalDeductions = tax + otherDeductions + leaveAdjustment;
  return { basicSalary: baseSalary, allowances, overtime, otherEarnings, leaveAdjustment, tax, otherDeductions, grossEarnings, totalDeductions, netPay: grossEarnings - totalDeductions };
}
export function approvedLeaveInputs(leaves: Array<{ status: string; start_date: string; end_date: string }>, period: { start_date: string; end_date: string }) {
  return leaves.filter(leave => leave.status === 'approved' && leave.start_date <= period.end_date && leave.end_date >= period.start_date);
}
