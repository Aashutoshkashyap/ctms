import { tenantAdminClient, bearerToken } from './projectAuthorization';

export type CompanyAdminAuthorization = { admin: NonNullable<ReturnType<typeof tenantAdminClient>>; userId: string; organizationId: string; role: string };

// Tenant administration is deliberately organization-scoped. Project selection
// is never used as the source of a tenant identity here.
export async function authorizeCompanyAdmin(request: Request): Promise<CompanyAdminAuthorization | { error: string; status: number }> {
  const token = bearerToken(request);
  if (!token) return { error: 'Authentication is required.', status: 401 };
  const admin = tenantAdminClient();
  if (!admin) return { error: 'Tenant administration is not configured.', status: 503 };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: 'Your session could not be verified.', status: 401 };
  const { data: member, error: memberError } = await admin.from('organization_members')
    .select('organization_id,role,status').eq('auth_user_id', data.user.id).eq('status', 'active').maybeSingle();
  if (memberError || !member || !['business_admin', 'project_director'].includes(member.role)) {
    return { error: 'Company administrator access is required.', status: 403 };
  }
  return { admin, userId: data.user.id, organizationId: member.organization_id, role: member.role };
}
