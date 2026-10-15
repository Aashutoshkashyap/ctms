export type ProjectPersonAssignment = {
  projectId: string;
  organizationId: string;
  personId: string;
  role: string;
  featurePermissions?: Record<string, string> | null;
};

/**
 * BuildTrack intentionally reuses Supabase auth.users.id as its stable person
 * identifier. Project memberships are assignments, not separate people.
 */
export function buildTrackPersonId(authUserId: string) {
  if (!authUserId) throw new Error('A verified authentication identity is required.');
  return authUserId;
}

export function assignmentsForPerson(assignments: ProjectPersonAssignment[], personId: string) {
  return assignments.filter(assignment => assignment.personId === personId);
}

export function canUseProjectAssignment(assignment: ProjectPersonAssignment, context: { projectId: string; organizationId: string; personId: string }) {
  return assignment.projectId === context.projectId && assignment.organizationId === context.organizationId && assignment.personId === context.personId;
}

/** A future messaging channel must request a project context when this is true. */
export function hasMultipleProjectContexts(assignments: ProjectPersonAssignment[], personId: string) {
  return new Set(assignmentsForPerson(assignments, personId).map(assignment => assignment.projectId)).size > 1;
}
