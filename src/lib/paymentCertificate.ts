export type PaymentCertificateStatus = 'draft' | 'submitted' | 'review' | 'approved' | 'certified' | 'rejected';
export type CertificateDeduction = { kind: 'retention' | 'advance_recovery' | 'other_contract_deduction'; amount: number; description?: string | null };
import { roundMoney } from './financialMetrics';

const transitions: Record<PaymentCertificateStatus, PaymentCertificateStatus[]> = {
  draft: ['submitted'], submitted: ['review', 'rejected'], review: ['approved', 'rejected'], approved: ['certified'], certified: [], rejected: [],
};

export function validCertificateTransition(from: PaymentCertificateStatus, to: PaymentCertificateStatus) {
  return transitions[from]?.includes(to) || false;
}

export function calculateCertificate(gross: number, deductions: CertificateDeduction[]) {
  const normalizedGross = roundMoney(gross);
  const normalizedDeductions = deductions.map(item => ({ ...item, amount: roundMoney(Number(item.amount)) }));
  const totalDeductions = roundMoney(normalizedDeductions.reduce((sum, item) => sum + item.amount, 0));
  if (totalDeductions > normalizedGross) throw new Error('Certificate deductions cannot exceed the certified gross amount.');
  return { grossCertifiedAmount: normalizedGross, totalDeductions, netCertifiedAmount: roundMoney(normalizedGross - totalDeductions), deductions: normalizedDeductions };
}
