import type { SupabaseClient } from '@supabase/supabase-js';
import { bearerToken, tenantAdminClient, type AuthorizationFailure } from './projectAuthorization';

export type OrganizationHrAuthorization = { admin: SupabaseClient; userId: string; organizationId: string };

/** HR master data is organization-private. Project membership never implies HR access. */
export async function authorizeOrganizationHrRequest(request: Request, organizationId: string): Promise<OrganizationHrAuthorization | AuthorizationFailure> {
  const token = bearerToken(request);
  if (!token) return { error: 'Authentication is required.', status: 401 };
  const admin = tenantAdminClient();
  if (!admin) return { error: 'Tenant authorization is not configured.', status: 503 };
  const verified = await admin.auth.getUser(token);
  if (verified.error || !verified.data.user) return { error: 'Your session could not be verified.', status: 401 };
  const userId = verified.data.user.id;
  const [platform, membership, organization] = await Promise.all([
    admin.from('platform_admins').select('auth_user_id').eq('auth_user_id', userId).maybeSingle(),
    admin.from('organization_members').select('role,status').eq('organization_id', organizationId).eq('auth_user_id', userId).maybeSingle(),
    admin.from('organizations').select('id,subscription_status,access_until').eq('id', organizationId).maybeSingle(),
  ]);
  if (platform.error || platform.data || membership.error || organization.error || !organization.data) return { error: 'HR access is not authorized.', status: 403 };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (membership.data?.status !== 'active' || membership.data.role !== 'business_admin' ||
    !['trial', 'active', 'past_due'].includes(organization.data.subscription_status) ||
    (organization.data.access_until && organization.data.access_until < today)) return { error: 'HR access is not authorized.', status: 403 };
  return { admin, userId, organizationId };
}
