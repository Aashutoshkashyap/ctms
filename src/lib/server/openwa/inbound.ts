import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordWorkflowEvent, resolveWorkflowRecipients } from '../workflowEvents';

export type SenderMatch = 'MATCHED' | 'UNKNOWN' | 'AMBIGUOUS';
export type NormalizedInbound = { eventId: string; sessionId: string; sender: string; senderNormalized: string; preview: string | null; occurredAt: string; eventType: string };

export function normalizePhone(value: unknown) {
  const source = String(value || '').trim().replace(/@(c\.us|s\.whatsapp\.net|lid)$/i, '');
  const digits = source.replace(/[^0-9]/g, '');
  return digits.length >= 7 && digits.length <= 18 ? `+${digits}` : '';
}

export function normalizeInboundEvent(payload: unknown): NormalizedInbound | null {
  const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const data = row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : row;
  const message = data.message && typeof data.message === 'object' ? data.message as Record<string, unknown> : data;
  const sessionId = String(row.sessionId || data.sessionId || data.session_id || '').trim();
  const eventId = String(row.id || row.eventId || data.id || data.eventId || message.id || '').trim();
  const sender = String(message.from || message.sender || data.from || data.sender || '').trim();
  const senderNormalized = normalizePhone(sender);
  if (!sessionId || !eventId || !senderNormalized) return null;
  const rawText = message.body || message.text || message.caption || data.body || data.text;
  const preview = typeof rawText === 'string' ? rawText.trim().replace(/\s+/g, ' ').slice(0, 280) || null : null;
  const occurred = String(row.timestamp || data.timestamp || message.timestamp || new Date().toISOString());
  const occurredAt = Number.isFinite(Date.parse(occurred)) ? new Date(occurred).toISOString() : new Date().toISOString();
  return { eventId, sessionId, sender, senderNormalized, preview, occurredAt, eventType: String(row.type || row.event || data.type || 'message.received') };
}

function departmentFromRole(role?: string | null) {
  const value = String(role || '').toLowerCase();
  if (value.includes('account') || value.includes('billing') || value.includes('finance')) return 'finance';
  if (value.includes('store') || value.includes('procurement')) return 'procurement';
  if (value.includes('safety')) return 'safety';
  if (value.includes('quality') || value.includes('qa')) return 'safety';
  if (value.includes('site') || value.includes('worker') || value.includes('engineer')) return 'site';
  return null;
}

type Employee = { id: string; project_id: string; name: string; email: string | null; phone: string | null; role: string | null };

export async function matchInboundSender(admin: SupabaseClient, organizationId: string, phone: string) {
  const { data: projects, error: projectsError } = await admin.from('projects').select('id').eq('organization_id', organizationId);
  if (projectsError) throw new Error('Could not resolve organization projects.');
  const projectIds = (projects || []).map((project) => project.id);
  if (!projectIds.length) return { state: 'UNKNOWN' as SenderMatch, profile: null, authUserId: null, departmentKey: null, projectId: null };
  const { data, error } = await admin.from('employee_profiles').select('id,project_id,name,email,phone,role').in('project_id', projectIds);
  if (error) throw new Error('Could not resolve employee sender identity.');
  const matches = ((data || []) as Employee[]).filter((employee) => normalizePhone(employee.phone) === phone);
  if (!matches.length) return { state: 'UNKNOWN' as SenderMatch, profile: null, authUserId: null, departmentKey: null, projectId: null };
  if (matches.length !== 1) return { state: 'AMBIGUOUS' as SenderMatch, profile: null, authUserId: null, departmentKey: null, projectId: null };
  const profile = matches[0];
  const { data: projectUser } = profile.email ? await admin.from('project_users').select('auth_user_id').eq('project_id', profile.project_id).eq('email', profile.email).maybeSingle() : { data: null };
  const authUserId = projectUser?.auth_user_id || null;
  const today = new Date().toISOString().slice(0, 10);
  const { data: assignment } = authUserId ? await admin.from('project_person_assignments').select('department_key').eq('organization_id', organizationId).eq('project_id', profile.project_id).eq('person_id', authUserId).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`).maybeSingle() : { data: null };
  return { state: 'MATCHED' as SenderMatch, profile, authUserId, departmentKey: assignment?.department_key || departmentFromRole(profile.role), projectId: profile.project_id };
}

export async function recordInboundMessage(admin: SupabaseClient, connection: { id: string; organization_id: string; openwa_session_id: string }, inbound: NormalizedInbound) {
  const eventKey = `openwa:${connection.id}:${inbound.eventId}`;
  const existing = await admin.from('whatsapp_inbound_events').select('id,processing_status,workflow_event_id').eq('organization_id', connection.organization_id).eq('provider_event_id', inbound.eventId).maybeSingle();
  if (existing.data?.processing_status === 'PROCESSED') return { duplicate: true, routed: Boolean(existing.data.workflow_event_id) };
  const match = await matchInboundSender(admin, connection.organization_id, inbound.senderNormalized);
  let inboundId = existing.data?.id as string | undefined;
  if (!inboundId) {
    const inserted = await admin.from('whatsapp_inbound_events').insert({ organization_id: connection.organization_id, connection_id: connection.id, provider_event_id: inbound.eventId, sender_phone: inbound.sender, sender_phone_normalized: inbound.senderNormalized, sender_match_status: match.state, employee_profile_id: match.profile?.id || null, person_id: match.authUserId, project_id: match.projectId, department_key: match.departmentKey, message_preview: inbound.preview, provider_event_type: inbound.eventType, occurred_at: inbound.occurredAt, processing_status: 'RECEIVED' }).select('id').single();
    if (inserted.error || !inserted.data) throw new Error('Could not store the inbound WhatsApp event.');
    inboundId = inserted.data.id;
  }
  const storedInboundId = inboundId;
  if (!storedInboundId) throw new Error('Inbound WhatsApp event identifier is missing.');
  try {
    let workflowEventId: string | null = null;
    // The existing inbox is project-scoped. An unresolved sender/project is
    // retained as auditable integration metadata, never guessed into a project.
    if (match.state === 'MATCHED' && match.projectId && match.departmentKey) {
      const recipients = await resolveWorkflowRecipients(admin, { organizationId: connection.organization_id, projectId: match.projectId, departmentKey: match.departmentKey });
      workflowEventId = await recordWorkflowEvent(admin, { organizationId: connection.organization_id, projectId: match.projectId, departmentKey: match.departmentKey, eventType: 'WHATSAPP_MESSAGE_RECEIVED', sourceType: 'OPENWA', sourceId: storedInboundId, dedupeKey: eventKey, metadata: { title: 'WhatsApp message received', senderName: match.profile?.name || 'Employee', senderMatch: match.state, preview: inbound.preview, messageId: inbound.eventId, projectContext: 'resolved' } }, recipients);
    }
    const saved = await admin.from('whatsapp_inbound_events').update({ processing_status: 'PROCESSED', workflow_event_id: workflowEventId, processed_at: new Date().toISOString(), error_message: null }).eq('id', storedInboundId).eq('organization_id', connection.organization_id);
    if (saved.error) throw new Error('Could not finalize inbound WhatsApp event.');
    return { duplicate: false, routed: Boolean(workflowEventId), match: match.state };
  } catch (error) {
    await admin.from('whatsapp_inbound_events').update({ processing_status: 'FAILED', error_message: 'Notification routing failed.' }).eq('id', storedInboundId).eq('organization_id', connection.organization_id);
    throw error;
  }
}
