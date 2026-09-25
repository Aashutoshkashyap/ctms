export type PaymentCertificateStatus = 'draft' | 'submitted' | 'review' | 'approved' | 'certified' | 'rejected';
export type CertificateDeduction = { kind: 'retention' | 'advance_recovery' | 'other_contract_deduction'; amount: number; description?: string | null };

const transitions: Record<PaymentCertificateStatus, PaymentCertificateStatus[]> = {
  draft: ['submitted'], submitted: ['review', 'rejected'], review: ['approved', 'rejected'], approved: ['certified'], certified: [], rejected: [],
};

export function validCertificateTransition(from: PaymentCertificateStatus, to: PaymentCertificateStatus) {
  return transitions[from]?.includes(to) || false;
}

function money(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Certificate monetary values must be non-negative.');
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCertificate(gross: number, deductions: CertificateDeduction[]) {
  const normalizedGross = money(gross);
  const normalizedDeductions = deductions.map(item => ({ ...item, amount: money(Number(item.amount)) }));
  const totalDeductions = money(normalizedDeductions.reduce((sum, item) => sum + item.amount, 0));
  if (totalDeductions > normalizedGross) throw new Error('Certificate deductions cannot exceed the certified gross amount.');
  return { grossCertifiedAmount: normalizedGross, totalDeductions, netCertifiedAmount: money(normalizedGross - totalDeductions), deductions: normalizedDeductions };
}
