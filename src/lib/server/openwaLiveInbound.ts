import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type FeaturePermissions } from '../permissions';
import { createCanonicalFieldUpdate, type CanonicalFieldUpdateOutcome, type ServerFieldUpdateOperations } from './canonicalFieldUpdate';
import { processInboundWhatsAppFieldUpdate, type InboundConversationStore, type InboundOrganizationContext, type InboundSenderResolution, type ProviderInboundWhatsAppEvent, type WhatsAppInboundResult } from './whatsappInboundFieldUpdate';
import { normalizeNepalWhatsAppNumber } from '../communicationIdentity';
import type { NotificationRoutingContext, PendingNotificationRecord } from '../notificationRouting';

type Row = Record<string, any>;

/**
 * Server-only bridge from the normalized provider event to the previously
 * prepared canonical boundaries. Provider data never contributes trusted
 * tenant, project, person, role, activity, or authorization values.
 */
export type OpenWaOrganizationGate = (organizationId: string) => Promise<boolean>;

export function buildOpenWaInboundProcessor(admin: SupabaseClient, options: { allowOrganization?: OpenWaOrganizationGate } = {}) {
  const resolveSender = async (address: string): Promise<InboundSenderResolution> => {
    const normalized = normalizeNepalWhatsAppNumber(address);
    if (!normalized) return { status: 'unknown' };
    const { data: identities, error } = await admin.from('communication_identities')
      .select('organization_id,person_id,pairing_state').eq('channel', 'WHATSAPP').eq('provider', 'GENERIC')
      .eq('normalized_address', normalized).eq('pairing_state', 'VERIFIED');
    if (error || !identities?.length) return { status: 'not_verified' };
    const personId = identities[0].person_id as string;
    // The same number cannot merge identities across people. Cross-tenant
    // duplicate rows are allowed only when they point to the same real person.
    if (identities.some((identity: Row) => identity.person_id !== personId)) return { status: 'unknown' };
    const organizations: InboundOrganizationContext[] = [];
    for (const identity of identities as Row[]) {
      const organizationId = identity.organization_id as string;
      // A provider configuration is never inferred from a valid phone number.
      // This hook is supplied by the HTTP boundary and remains server-only.
      if (options.allowOrganization && !(await options.allowOrganization(organizationId))) continue;
      const { data: memberships, error: memberError } = await admin.from('project_users')
        .select('project_id,role,feature_permissions').eq('auth_user_id', personId);
      if (memberError || !memberships?.length) continue;
      const projectIds = memberships.map((member: Row) => member.project_id).filter(Boolean);
      const { data: projects, error: projectError } = await admin.from('projects').select('id,name,organization_id').in('id', projectIds).eq('organization_id', organizationId);
      if (projectError || !projects?.length) continue;
      const { data: activities, error: activityError } = await admin.from('activities').select('id,project_id,wbs_code,name,unit').in('project_id', projects.map((project: Row) => project.id));
      if (activityError) continue;
      const validProjects = (projects as Row[]).flatMap(project => {
        const membership = (memberships as Row[]).find(item => item.project_id === project.id);
        if (!membership || !can(membership.role, 'daily_reports', membership.feature_permissions as FeaturePermissions, 'write')) return [];
        return [{ projectId: project.id, organizationId, personId, canSubmitDailyWork: true,
          activities: (activities as Row[]).filter(item => item.project_id === project.id).map(item => ({ id: item.id, wbsCode: item.wbs_code, name: item.name, unit: item.unit || undefined })) }];
      });
      if (validProjects.length) organizations.push({ organizationId, projects: validProjects, projectLabels: (projects as Row[]).map(project => ({ id: project.id, name: project.name })), communicationIdentity: { personId, organizationId, pairingState: 'VERIFIED' } });
    }
    return organizations.length ? { status: 'verified', personId, organizations } : { status: 'not_verified' };
  };

  const conversations: InboundConversationStore = {
    async findByMessage(provider, providerMessageId) {
      const { data } = await admin.from('field_update_conversation_contexts').select('*').eq('provider', provider)
        .or(`origin_provider_message_id.eq.${providerMessageId},last_provider_message_id.eq.${providerMessageId}`).maybeSingle();
      return data ? readConversation(data as Row) : null;
    },
    async findActive(provider, personId, now) {
      const { data } = await admin.from('field_update_conversation_contexts').select('*').eq('provider', provider).eq('person_id', personId)
        .eq('state', 'pending').gte('expires_at', now).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      return data ? readConversation(data as Row) : null;
    },
    async save(context) {
      const { error } = await admin.from('field_update_conversation_contexts').upsert({ id: context.id, provider: context.provider, origin_provider_message_id: context.originProviderMessageId,
        last_provider_message_id: context.lastProviderMessageId, person_id: context.personId, organization_id: context.organizationId || null, pending_question: context.question,
        candidate_input: context.input, options: context.options, expires_at: context.expiresAt, state: context.state, updated_at: new Date().toISOString() }, { onConflict: 'provider,origin_provider_message_id' });
      if (error) throw new Error(error.message);
    },
    async resolve(id, providerMessageId) {
      const { error } = await admin.from('field_update_conversation_contexts').update({ state: 'resolved', last_provider_message_id: providerMessageId, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },
  };

  // Operation keys are unique per organization. Keep that scope while the
  // canonical command invokes complete/fail without a separate org argument.
  const operationOrganizations = new Map<string, string>();
  const operations: ServerFieldUpdateOperations = {
    async find(operationId, organizationId) {
      operationOrganizations.set(operationId, organizationId);
      const { data, error } = await admin.from('field_update_operations').select('canonical_record_id,outcome_code').eq('organization_id', organizationId).eq('operation_key', operationId).maybeSingle();
      if (error || !data) return null;
      const outcome: CanonicalFieldUpdateOutcome | undefined = data.outcome_code ? { code: data.outcome_code, message: 'This field update was already processed.', recordId: data.canonical_record_id || undefined } as CanonicalFieldUpdateOutcome : undefined;
      return { operationId, recordId: data.canonical_record_id || undefined, outcome };
    },
    async claim(operationId, organizationId, personId, source) {
      operationOrganizations.set(operationId, organizationId);
      const { error } = await admin.from('field_update_operations').insert({ organization_id: organizationId, operation_key: operationId, person_id: personId, source, state: 'PENDING' });
      if (!error) return 'claimed';
      if (error.code === '23505') return 'duplicate';
      throw new Error(error.message);
    },
    async complete(operationId, outcome) {
      const state = outcome.code === 'ACCEPTED' ? 'ACCEPTED' : outcome.code === 'CONFLICT' || outcome.code === 'DUPLICATE' ? 'CONFLICT' : 'FAILED';
      const organizationId = operationOrganizations.get(operationId);
      if (!organizationId) throw new Error('Operation organization context is missing.');
      const { error } = await admin.from('field_update_operations').update({ state, canonical_record_id: outcome.recordId || null, outcome_code: outcome.code, updated_at: new Date().toISOString() }).eq('operation_key', operationId).eq('organization_id', organizationId);
      if (error) throw new Error(error.message);
    },
    async fail(operationId) {
      const organizationId = operationOrganizations.get(operationId);
      if (!organizationId) throw new Error('Operation organization context is missing.');
      const { error } = await admin.from('field_update_operations').update({ state: 'FAILED', updated_at: new Date().toISOString() }).eq('operation_key', operationId).eq('organization_id', organizationId);
      if (error) throw new Error(error.message);
    },
  };

  const persistence = {
    async create(candidate: any, operationId: string) {
      const recordId = `whatsapp-work:${operationId}`.slice(0, 250);
      const { error } = await admin.from('daily_work_items').insert({ id: recordId, project_id: candidate.projectId, activity_id: candidate.activityId || null,
        quantity_completed: candidate.quantity ?? 0, delay_reason: candidate.problem || candidate.description || null });
      if (error) {
        if (error.code === '23505') return { recordId };
        throw new Error(error.message);
      }
      return { recordId };
    },
  };

  return {
    handle(event: ProviderInboundWhatsAppEvent): Promise<WhatsAppInboundResult> {
      return processInboundWhatsAppFieldUpdate(event, {
        resolveSender,
        conversations,
        command: {
          create: async (input, context) => createCanonicalFieldUpdate(input, context, operations, persistence, {
            // BuildTrack notifications are recorded after canonical persistence;
            // no OpenWA reply/outbound delivery is attempted in this phase.
            publish: async () => {},
            routing: {
              context: await notificationRoutingContext(admin, context.organizationId, context.projects.map(project => project.projectId)),
              persist: records => persistBuildTrackNotifications(admin, records),
            },
          }),
        },
      });
    },
  };
}

async function notificationRoutingContext(admin: SupabaseClient, organizationId: string, projectIds: string[]): Promise<NotificationRoutingContext> {
  const [membershipsResult, relationshipsResult, recipientsResult] = await Promise.all([
    admin.from('project_users').select('project_id,auth_user_id').in('project_id', projectIds),
    admin.from('project_reporting_relationships').select('organization_id,project_id,person_id,supervisor_person_id,is_project_responsible,notifications_enabled').eq('organization_id', organizationId).in('project_id', projectIds),
    admin.from('organization_notification_recipients').select('organization_id,person_id,event_types,notifications_enabled').eq('organization_id', organizationId),
  ]);
  if (membershipsResult.error) throw new Error(membershipsResult.error.message);
  if (relationshipsResult.error) throw new Error(relationshipsResult.error.message);
  if (recipientsResult.error) throw new Error(recipientsResult.error.message);
  return {
    projectMemberships: (membershipsResult.data || []).map((row: Row) => ({ organizationId, projectId: row.project_id, personId: row.auth_user_id, active: true })),
    reportingRelationships: (relationshipsResult.data || []).map((row: Row) => ({ organizationId: row.organization_id, projectId: row.project_id, personId: row.person_id, supervisorPersonId: row.supervisor_person_id || undefined, isProjectResponsible: row.is_project_responsible, notificationsEnabled: row.notifications_enabled })),
    organizationRecipients: (recipientsResult.data || []).map((row: Row) => ({ organizationId: row.organization_id, personId: row.person_id, active: true, notificationsEnabled: row.notifications_enabled, eventTypes: row.event_types || [] })),
  };
}

async function persistBuildTrackNotifications(admin: SupabaseClient, records: PendingNotificationRecord[]) {
  if (!records.length) return;
  const { error } = await admin.from('app_notifications').upsert(records.map(record => ({
    id: record.id,
    project_id: record.projectId,
    organization_id: record.organizationId,
    recipient_person_id: record.recipientPersonId,
    actor_person_id: record.actorPersonId || null,
    record_id: record.recordId || null,
    event_id: record.eventId,
    event_type: record.eventType,
    source: record.source,
    delivery_channel: record.channel,
    delivery_status: record.status,
    action: 'Field update recorded',
    module: 'Daily work update',
    detail: 'A WhatsApp field update was recorded.',
    created_at: record.createdAt,
    read: false,
  })), { onConflict: 'event_id,recipient_person_id,delivery_channel' });
  if (error) throw new Error(error.message);
}

function readConversation(row: Row) {
  return { id: row.id, provider: row.provider, originProviderMessageId: row.origin_provider_message_id, lastProviderMessageId: row.last_provider_message_id,
    personId: row.person_id, organizationId: row.organization_id || undefined, question: row.pending_question, input: row.candidate_input || {}, options: row.options || [], expiresAt: row.expires_at, state: row.state } as any;
}
