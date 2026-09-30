import type { ProjectPersonAssignment } from './personIdentity';

export type CommunicationChannel = 'WHATSAPP';
export type CommunicationProvider = 'GENERIC';
export type PairingState = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REVOKED';

export type CommunicationIdentity = {
  id: string;
  organizationId: string;
  personId: string;
  channel: CommunicationChannel;
  provider: CommunicationProvider;
  normalizedAddress: string;
  pairingState: PairingState;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string | null;
  revokedAt?: string | null;
};

/**
 * BuildTrack currently accepts only Nepal mobile numbers for the WhatsApp
 * pairing flow. This deliberate boundary rejects ambiguous international/local
 * values instead of guessing a country or treating a phone as an account.
 */
export function normalizeNepalWhatsAppNumber(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s().-]/g, '');
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  const digits = international.replace(/^\+/, '');
  if (/^9[78]\d{8}$/.test(digits)) return `+977${digits}`;
  if (/^9779[78]\d{8}$/.test(digits) && international.startsWith('+')) return `+${digits}`;
  return null;
}

export function maskCommunicationAddress(address: string) {
  if (address.length < 7) return '••••';
  return `${address.slice(0, 6)}••••${address.slice(-2)}`;
}

export function isUsableVerifiedCommunicationIdentity(identity: Pick<CommunicationIdentity, 'pairingState'>) {
  return identity.pairingState === 'VERIFIED';
}

/** Admins may initiate or revoke a pairing, never self-attest verification. */
export function allowedPairingTransition(from: PairingState, to: PairingState) {
  if (to === 'PENDING') return from === 'UNVERIFIED' || from === 'REVOKED';
  if (to === 'REVOKED') return from !== 'REVOKED';
  return false;
}

export type CommunicationIdentityAdminContext = {
  organizationId: string;
  actorPersonId: string;
  canManageUsers: boolean;
  targetPersonId: string;
  targetAssignments: ProjectPersonAssignment[];
};

/** A trusted server authorization result supplies this context; phone input never does. */
export function authorizeCommunicationIdentityAdministration(context: CommunicationIdentityAdminContext) {
  if (!context.canManageUsers) return { allowed: false as const, reason: 'User-management authority is required.' };
  if (!context.actorPersonId || !context.targetPersonId) return { allowed: false as const, reason: 'A verified actor and target person are required.' };
  if (!context.targetAssignments.some(assignment => assignment.personId === context.targetPersonId && assignment.organizationId === context.organizationId)) {
    return { allowed: false as const, reason: 'The target person is not assigned within this organization.' };
  }
  return { allowed: true as const };
}

/** Identity lookup can establish only a potential person; project context stays explicit. */
export function projectContextsForCommunicationIdentity(assignments: ProjectPersonAssignment[], identity: Pick<CommunicationIdentity, 'personId' | 'organizationId' | 'pairingState'>) {
  if (!isUsableVerifiedCommunicationIdentity(identity)) return [];
  return assignments.filter(assignment => assignment.personId === identity.personId && assignment.organizationId === identity.organizationId);
}

export function hasAmbiguousCommunicationProjectContext(assignments: ProjectPersonAssignment[], identity: Pick<CommunicationIdentity, 'personId' | 'organizationId' | 'pairingState'>) {
  return new Set(projectContextsForCommunicationIdentity(assignments, identity).map(item => item.projectId)).size > 1;
}
