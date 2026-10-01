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

export type OrganizationAuthorization = {
  organizationId: string;
  organizationName: string;
  role: string;
};

// This is the tenant boundary used by every server-side authorization path.
// A project row or an old project_users row never substitutes for an active
// organization membership.
export async function authorizeActiveOrganizationMember(
  admin: SupabaseClient, userId: string, organizationId: string,
): Promise<OrganizationAuthorization | AuthorizationFailure> {
  const denied = { error: 'Organization access is not authorized.', status: 403 };
  const [organization, member] = await Promise.all([
    admin.from('organizations').select('id,name,subscription_status,access_until').eq('id', organizationId).maybeSingle(),
    admin.from('organization_members').select('role,status').eq('organization_id', organizationId).eq('auth_user_id', userId).maybeSingle(),
  ]);
  if (organization.error || member.error || !organization.data || !member.data || member.data.status !== 'active') return denied;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!['trial', 'active', 'past_due'].includes(organization.data.subscription_status) || (organization.data.access_until && organization.data.access_until < today)) return denied;
  return { organizationId, organizationName: organization.data.name, role: normalizeRole(member.data.role) };
}

// B3 exposes the existing entitlement data behind one server-only check. It
// deliberately does not gate modules yet: B4 owns subscription enforcement.
export async function hasOrganizationModuleEntitlement(admin: SupabaseClient, organizationId: string, moduleKey: string) {
  const override = await admin.from('organization_module_entitlements').select('enabled').eq('organization_id', organizationId).eq('module_key', moduleKey).maybeSingle();
  if (override.error) return false;
  if (override.data) return override.data.enabled === true;
  const organization = await admin.from('organizations').select('plan,plan_version').eq('id', organizationId).maybeSingle();
  if (organization.error || !organization.data) return false;
  const plan = await admin.from('subscription_plan_module_entitlements').select('enabled').eq('plan_code', organization.data.plan).eq('plan_version', organization.data.plan_version).eq('module_key', moduleKey).maybeSingle();
  return !plan.error && plan.data?.enabled === true;
}

// Server-authoritative reads only. Caller-supplied identity, role and tenant are never trusted.
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
  const [organization, membership] = await Promise.all([
    authorizeActiveOrganizationMember(admin, userId, organizationId),
    admin.from('project_users').select('role,feature_permissions').eq('project_id', projectId).eq('auth_user_id', userId).maybeSingle(),
  ]);
  if ('error' in organization || membership.error || !membership.data) return denied;
  const sourceRole = membership.data.role;
  const role = normalizeRole(sourceRole);
  if (role === 'super_admin' || (role === 'employer_viewer' && sourceRole !== 'employer_viewer')) return denied;
  const permissions = membership.data?.feature_permissions || {};
  if (!can(role, feature, permissions, access)) return denied;
  return { admin, userId, role, permissions, project: {
    id: project.data.id, name: project.data.name,
    organizationId, organizationName: organization.organizationName,
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

// Notifications are personal inbox records rather than a project capability.
// This verifies the same tenant, subscription and project-membership boundary
// without accidentally granting access to the event source itself.
export async function authorizeProjectMembershipRequest(request: Request, projectId: string) {
  const token = bearerToken(request);
  if (!token) return { error: 'Authentication is required.', status: 401 } as AuthorizationFailure;
  const admin = tenantAdminClient();
  if (!admin) return { error: 'Tenant authorization is not configured.', status: 503 } as AuthorizationFailure;
  const verified = await admin.auth.getUser(token);
  if (verified.error || !verified.data.user) return { error: 'Your session could not be verified.', status: 401 } as AuthorizationFailure;
  const project = await admin.from('projects').select('id,name,organization_id').eq('id', projectId).maybeSingle();
  if (project.error || !project.data?.organization_id) return { error: 'Project access is not authorized.', status: 403 } as AuthorizationFailure;
  const membership = await authorizeProjectUser(admin, verified.data.user.id, projectId, 'executive', 'read');
  if (!('error' in membership)) return membership;
  // A field employee may have no Executive feature but is still entitled to
  // their own notification inbox. Membership never authorizes source data.
  const [organization, projectUser] = await Promise.all([
    authorizeActiveOrganizationMember(admin, verified.data.user.id, project.data.organization_id),
    admin.from('project_users').select('auth_user_id,role,feature_permissions').eq('project_id', projectId).eq('auth_user_id', verified.data.user.id).maybeSingle(),
  ]);
  if ('error' in organization || projectUser.error || !projectUser.data) return { error: 'Project access is not authorized.', status: 403 } as AuthorizationFailure;
  return { admin, userId: verified.data.user.id, role: normalizeRole(projectUser.data.role), permissions: projectUser.data.feature_permissions || {}, project: { id: project.data.id, name: project.data.name, organizationId: project.data.organization_id, organizationName: organization.organizationName } } satisfies ProjectAuthorization;
}
