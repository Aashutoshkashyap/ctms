import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { can, normalizeRole, type Feature, type FeaturePermissions } from '../permissions';

export type AuthorizationFailure = { error: string; status: number };
export type ProjectAuthorization = {
  admin: SupabaseClient;
  userId: string;
  role: string;
  permissions: FeaturePermissions;
  project: { id: string; name: string; organizationId: string; organizationName: string };
};

export function tenantAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

// Server-authoritative reads only. Caller-supplied identity, role and tenant are never trusted.
// Existing staff may have no organization_members row: their project membership
// establishes tenant membership. An explicit inactive organization row always denies.
export async function authorizeProjectUser(
  admin: SupabaseClient, userId: string, projectId: string,
  feature: Feature, access: 'read' | 'write' = 'read',
): Promise<ProjectAuthorization | AuthorizationFailure> {
  const denied = { error: 'Project access is not authorized.', status: 403 };
  const platform = await admin.from('platform_admins').select('auth_user_id').eq('auth_user_id', userId).maybeSingle();
  if (platform.error || platform.data) return denied;
  const project = await admin.from('projects').select('id,name,organization_id').eq('id', projectId).maybeSingle();
  if (project.error || !project.data?.organization_id) return denied;
  const organizationId = project.data.organization_id;
  const [organization, organizationMember, membership] = await Promise.all([
    admin.from('organizations').select('id,name,subscription_status,access_until').eq('id', organizationId).maybeSingle(),
    admin.from('organization_members').select('role,status').eq('organization_id', organizationId).eq('auth_user_id', userId).maybeSingle(),
    admin.from('project_users').select('role,feature_permissions').eq('project_id', projectId).eq('auth_user_id', userId).maybeSingle(),
  ]);
  if (organization.error || organizationMember.error || membership.error || !organization.data) return denied;
  if (organizationMember.data && organizationMember.data.status !== 'active') return denied;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!['trial', 'active', 'past_due'].includes(organization.data.subscription_status) ||
      (organization.data.access_until && organization.data.access_until < today)) return denied;
  // Only the existing organization Business Admin scope can substitute for a
  // project assignment. Its narrow feature baseline still applies.
  const sourceRole = membership.data?.role || (organizationMember.data?.role === 'business_admin' ? 'business_admin' : '');
  if (!sourceRole) return denied;
  const role = normalizeRole(sourceRole);
  if (role === 'super_admin' || (role === 'employer_viewer' && sourceRole !== 'employer_viewer')) return denied;
  const permissions = membership.data?.feature_permissions || {};
  if (!can(role, feature, permissions, access)) return denied;
  return { admin, userId, role, permissions, project: {
    id: project.data.id, name: project.data.name,
    organizationId, organizationName: organization.data.name,
  } };
}

export async function authorizeProjectRequest(request: Request, projectId: string, feature: Feature, access: 'read' | 'write' = 'read') {
  const token = bearerToken(request);
  if (!token) return { error: 'Authentication is required.', status: 401 } as AuthorizationFailure;
  const admin = tenantAdminClient();
  if (!admin) return { error: 'Tenant authorization is not configured.', status: 503 } as AuthorizationFailure;
  const verified = await admin.auth.getUser(token);
  if (verified.error || !verified.data.user) return { error: 'Your session could not be verified.', status: 401 } as AuthorizationFailure;
  return authorizeProjectUser(admin, verified.data.user.id, projectId, feature, access);
}
