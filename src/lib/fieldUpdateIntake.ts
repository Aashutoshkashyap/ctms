export type FieldUpdateSource = 'WEB' | 'MOBILE' | 'WHATSAPP' | 'FUTURE';
export type FieldMediaReference = { kind: 'photo' | 'audio' | 'document'; reference: string; storageConfirmed: boolean };
export type FieldUpdateActivity = { id: string; wbsCode: string; name: string; unit?: string };
export type FieldUpdateProjectContext = {
  projectId: string; organizationId: string; personId: string; canSubmitDailyWork: boolean; activities: FieldUpdateActivity[];
};
export type FieldUpdateAuthorizationContext = { personId: string; organizationId: string; projects: FieldUpdateProjectContext[] };
export type FlexibleFieldUpdateInput = {
  personId: string; organizationId: string; source: FieldUpdateSource; projectId?: string; activityId?: string; wbsCode?: string;
  occurredAt?: string; quantity?: number; unit?: string; description?: string; problem?: string; media?: FieldMediaReference[];
};
export type FieldUpdateCandidate = {
  personId: string; organizationId: string; source: FieldUpdateSource; projectId: string; activityId?: string; wbsCode?: string;
  occurredAt: string; quantity?: number; unit?: string; description?: string; problem?: string; media: FieldMediaReference[];
  mapping: 'mapped' | 'partial';
};
export type FieldUpdateIntakeResult =
  | { status: 'accepted'; candidate: FieldUpdateCandidate; event: { type: 'field_update_created'; projectId: string; personId: string } }
  | { status: 'needs_clarification'; question: string; projectOptions: Array<{ id: string; name: string }>; activityOptions: Array<{ id: string; label: string }> }
  | { status: 'rejected'; reason: string };

function activityOptions(project: FieldUpdateProjectContext) {
  return project.activities.slice(0, 8).map(activity => ({ id: activity.id, label: `${activity.wbsCode} — ${activity.name}` }));
}

/**
 * Provider-neutral intake evaluation. The context must be resolved by a
 * server-authoritative membership check; a sender number or client payload is
 * never a substitute for the person/project context passed here.
 */
export function evaluateFieldUpdate(input: FlexibleFieldUpdateInput, context: FieldUpdateAuthorizationContext): FieldUpdateIntakeResult {
  if (!input.personId || input.personId !== context.personId || input.organizationId !== context.organizationId) {
    return { status: 'rejected', reason: 'The submitted person or organization context is not authorized.' };
  }
  const projects = context.projects.filter(project => project.personId === context.personId && project.organizationId === context.organizationId && project.canSubmitDailyWork);
  if (input.projectId && !projects.some(project => project.projectId === input.projectId)) return { status: 'rejected', reason: 'The selected project is not assigned to this person.' };
  let project = input.projectId ? projects.find(item => item.projectId === input.projectId) : undefined;

  if (!project && input.activityId) {
    const matches = projects.filter(item => item.activities.some(activity => activity.id === input.activityId));
    if (matches.length === 1) project = matches[0];
  }
  if (!project && projects.length === 1) project = projects[0];
  if (!project) {
    return { status: 'needs_clarification', question: 'Which project/work?', projectOptions: projects.map(item => ({ id: item.projectId, name: item.projectId })), activityOptions: [] };
  }

  let activity = input.activityId ? project.activities.find(item => item.id === input.activityId) : undefined;
  if (input.activityId && !activity) return { status: 'rejected', reason: 'The selected work item does not belong to this project.' };
  if (!activity && input.wbsCode) {
    const matches = project.activities.filter(item => item.wbsCode === input.wbsCode);
    if (matches.length === 1) activity = matches[0];
    else if (matches.length > 1) return { status: 'needs_clarification', question: 'Which work item?', projectOptions: [], activityOptions: activityOptions(project) };
  }
  const hasMeaningfulInput = Boolean(input.description || input.problem || input.media?.length || input.quantity !== undefined);
  if (!hasMeaningfulInput) return { status: 'rejected', reason: 'Add a description, quantity, issue, or media reference.' };
  return {
    status: 'accepted',
    candidate: {
      personId: context.personId, organizationId: context.organizationId, source: input.source, projectId: project.projectId,
      activityId: activity?.id, wbsCode: activity?.wbsCode || input.wbsCode, occurredAt: input.occurredAt || new Date().toISOString(),
      quantity: input.quantity, unit: input.unit || activity?.unit, description: input.description, problem: input.problem,
      media: input.media || [], mapping: activity ? 'mapped' : 'partial',
    },
    event: { type: 'field_update_created', projectId: project.projectId, personId: context.personId },
  };
}

/**
 * The future server command supplies a trusted authorization context and a
 * persistence implementation. It does not send messages or route recipients.
 */
export async function submitFieldUpdate(
  input: FlexibleFieldUpdateInput,
  context: FieldUpdateAuthorizationContext,
  persistence: { save(candidate: FieldUpdateCandidate): Promise<void> },
) {
  const result = evaluateFieldUpdate(input, context);
  if (result.status === 'accepted') await persistence.save(result.candidate);
  return result;
}
