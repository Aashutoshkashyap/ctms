export type CommercialType = 'variation' | 'claim_cost' | 'claim_eot';
export type CommercialStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';

const transitions: Record<CommercialStatus, CommercialStatus[]> = {
  draft: ['submitted', 'withdrawn'], submitted: ['under_review', 'rejected', 'withdrawn'],
  under_review: ['approved', 'rejected'], approved: [], rejected: [], withdrawn: [],
};

export function canTransition(from: CommercialStatus, to: CommercialStatus) {
  return transitions[from]?.includes(to) || false;
}

export function revisedCompletionDate(original: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(original) || !Number.isInteger(days) || days < 0) throw new Error('A valid original completion date and non-negative whole extension days are required.');
  const date = new Date(`${original}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function commercialTitle(type: CommercialType) {
  return type === 'variation' ? 'Variation' : type === 'claim_eot' ? 'Extension of Time' : 'Claim';
}
