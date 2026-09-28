import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { activeAssignmentPeople, type WorkflowAssignment } from '../workflowRecipients';

export type WorkflowEventInput = { organizationId: string; projectId: string; departmentKey?: string; eventType: string; sourceType: string; sourceId: string; actorUserId?: string; dedupeKey: string; metadata?: Record<string, unknown> };
export { activeAssignmentPeople } from '../workflowRecipients';

// Read-only UX-2 assignment lookup; it cannot create membership or access.
export async function resolveWorkflowRecipients(admin: SupabaseClient, event: Pick<WorkflowEventInput, 'organizationId' | 'projectId' | 'departmentKey'>) {
  const { data, error } = await admin.from('project_person_assignments').select('person_id,project_role,start_date,end_date').eq('organization_id', event.organizationId).eq('project_id', event.projectId);
  if (error) throw new Error('Could not resolve notification recipients.');
  return activeAssignmentPeople((data || []) as WorkflowAssignment[], event.departmentKey);
}

export async function recordWorkflowEvent(admin: SupabaseClient, event: WorkflowEventInput, recipientUserIds: string[]) {
  const { data, error } = await admin.from('workflow_events').upsert({ organization_id: event.organizationId, project_id: event.projectId, department_key: event.departmentKey || null, event_type: event.eventType, source_type: event.sourceType, source_id: event.sourceId, actor_user_id: event.actorUserId || null, dedupe_key: event.dedupeKey, metadata: event.metadata || {} }, { onConflict: 'organization_id,dedupe_key' }).select('id').single();
  if (error || !data) throw new Error('Could not record workflow event.');
  const rows = [...new Set(recipientUserIds)].map((recipientUserId) => ({ id: `workflow-${data.id}-${recipientUserId}`, event_id: data.id, recipient_user_id: recipientUserId, project_id: event.projectId, actor: 'BuildTrack', action: event.eventType, module: event.departmentKey || 'Project', detail: String(event.metadata?.title || event.eventType), created_at: new Date().toISOString(), read: false }));
  if (rows.length) { const { error: notificationError } = await admin.from('app_notifications').upsert(rows, { onConflict: 'event_id,recipient_user_id' }); if (notificationError) throw new Error('Could not record workflow notifications.'); }
  return data.id;
}
