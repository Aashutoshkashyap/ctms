export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'suspended', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// `past_due` is the established persisted representation for an expired
// subscription. It is intentionally retained for compatibility with existing
// organizations and project authorization checks.
export const subscriptionStatusLabel = (status: SubscriptionStatus) => status === 'past_due' ? 'Expired' : status.replace('_', ' ');

const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ['active', 'past_due', 'suspended', 'cancelled'],
  active: ['past_due', 'suspended', 'cancelled'],
  past_due: ['active', 'suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: ['active'],
};

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionSubscription(current: string, next: string): boolean {
  if (!isSubscriptionStatus(current) || !isSubscriptionStatus(next)) return false;
  return current === next || TRANSITIONS[current].includes(next);
}

export function validPaymentTransition(current: string, next: string): boolean {
  if (current === next) return current === 'verified'; // safe idempotent re-read only
  return current === 'pending' && ['verified', 'rejected'].includes(next);
}
