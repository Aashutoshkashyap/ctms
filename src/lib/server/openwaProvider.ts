import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeProjectRequest } from './projectAuthorization';
import { ORGANIZATION_STORAGE_LEADERS } from './organizationStorage';
import { whatsappConfig, type OpenWaProviderState } from './whatsappAdapter';

export type OpenWaProviderConfiguration = {
  id: string; organization_id: string; provider: 'OPENWA'; state: OpenWaProviderState;
  endpoint_base_url: string | null; webhook_secret_ref: string | null;
  last_health_at: string | null; last_health_state: 'UNKNOWN' | 'HEALTHY' | 'ERROR' | null;
  last_error_code: string | null; configured_by: string | null; updated_at: string;
};

export function canManageOpenWa(role: string, organizationMatches: boolean) {
  return organizationMatches && ORGANIZATION_STORAGE_LEADERS.includes(role as typeof ORGANIZATION_STORAGE_LEADERS[number]);
}

/** Configuration management is organization-scoped and never grants application membership. */
export async function authorizeOpenWaManagement(request: Request, projectId: string) {
  const authorized = await authorizeProjectRequest(request, projectId, 'settings', 'write');
  if ('error' in authorized) return authorized;
  if (!canManageOpenWa(authorized.role, Boolean(authorized.project.organizationId))) {
    return { error: 'Only organization leadership can manage the OpenWA provider.', status: 403 } as const;
  }
  return authorized;
}

/** This deliberately omits endpoint and secret references from browser output. */
export function openWaHealthView(connection: OpenWaProviderConfiguration | null) {
  const runtime = whatsappConfig();
  const state = connection?.state || 'DISABLED';
  return {
    configured: state !== 'DISABLED', enabled: state === 'ENABLED' && runtime.enabled,
    state: runtime.enabled ? 'ENABLED' : state,
    webhookAuthenticationConfigured: Boolean(connection?.webhook_secret_ref && runtime.webhookSecret),
    lastHealthAt: connection?.last_health_at || null,
    lastHealthState: connection?.last_health_state || 'UNKNOWN',
    lastErrorCode: connection?.last_error_code || null,
  };
}

export async function readOpenWaConfiguration(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await admin.from('openwa_provider_configurations')
    .select('id,organization_id,provider,state,endpoint_base_url,webhook_secret_ref,last_health_at,last_health_state,last_error_code,configured_by,updated_at')
    .eq('organization_id', organizationId).eq('provider', 'OPENWA').maybeSingle();
  // Until the additive migration is deployed, the UI reports disabled rather
  // than treating a missing table as implicit activation.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return null;
  if (error) throw new Error(error.message);
  return data as OpenWaProviderConfiguration | null;
}

export function safeOpenWaConfigurationInput(input: { state?: string; endpointBaseUrl?: string; webhookSecretRef?: string }) {
  const state = input.state === 'CONFIGURED' ? 'CONFIGURED' : input.state === 'DISABLED' ? 'DISABLED' : null;
  const endpoint = input.endpointBaseUrl?.trim() || null;
  const secretRef = input.webhookSecretRef?.trim() || null;
  if (!state) return null;
  if (endpoint && (!/^https:\/\//i.test(endpoint) || endpoint.length > 500)) return null;
  if (secretRef && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(secretRef)) return null;
  if (state === 'CONFIGURED' && (!endpoint || !secretRef)) return null;
  return { state, endpoint_base_url: endpoint, webhook_secret_ref: secretRef };
}
