import { authorizeCompanyAdmin } from '../../../lib/server/companyAdmin';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../lib/server/security';

const emailOk = (value: unknown) => typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value);
const safeText = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export async function GET(request: Request) {
  const limited = rateLimit({ key: `company-admin:${getClientIp(request)}`, limit: 60, windowMs: 60_000 });
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const auth = await authorizeCompanyAdmin(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const [organization, members, projects, entitlements] = await Promise.all([
    auth.admin.from('organizations').select('id,name,legal_name,contact_email,phone,address,website,plan,plan_version,subscription_status,access_until,seat_limit,project_limit').eq('id', auth.organizationId).single(),
    auth.admin.from('organization_members').select('id,auth_user_id,email,name,role,status,created_at').eq('organization_id', auth.organizationId).order('created_at'),
    auth.admin.from('projects').select('id,name,status').eq('organization_id', auth.organizationId).order('name'),
    auth.admin.from('organization_module_entitlements').select('module_key,enabled').eq('organization_id', auth.organizationId),
  ]);
  if (organization.error || !organization.data) return Response.json({ error: 'Company profile was not found.' }, { status: 404 });
  const projectIds = (projects.data || []).map((project: any) => project.id);
  const { data: assignments } = projectIds.length ? await auth.admin.from('project_users').select('auth_user_id,project_id').in('project_id', projectIds) : { data: [] as Array<{ auth_user_id: string; project_id: string }> };
  const projectNames = new Map((projects.data || []).map((project: any) => [project.id, project.name]));
  const membersWithProjects = (members.data || []).map((member: any) => ({ ...member, projects: (assignments || []).filter((item: any) => item.auth_user_id === member.auth_user_id).map((item: any) => ({ id: item.project_id, name: projectNames.get(item.project_id) || 'Project' })) }));
  return Response.json({ organization: organization.data, members: membersWithProjects, projects: projects.data || [], entitlements: entitlements.data || [], usage: { seats: membersWithProjects.filter((member: any) => member.status === 'active').length, projects: (projects.data || []).filter((project: any) => project.status !== 'archived').length } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const auth = await authorizeCompanyAdmin(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  if (action === 'profile') {
    const contactEmail = safeText(body?.contactEmail, 160).toLowerCase();
    if (contactEmail && !emailOk(contactEmail)) return Response.json({ error: 'Enter a valid company email.' }, { status: 400 });
    const { data, error } = await auth.admin.from('organizations').update({
      name: safeText(body?.name, 160), legal_name: safeText(body?.legalName, 200) || null, contact_email: contactEmail || null,
      phone: safeText(body?.phone, 60) || null, address: safeText(body?.address, 500) || null, website: safeText(body?.website, 240) || null, updated_at: new Date().toISOString(),
    }).eq('id', auth.organizationId).select('id,name,legal_name,contact_email,phone,address,website,plan,subscription_status,access_until,seat_limit,project_limit').single();
    if (error || !data) return Response.json({ error: error?.message || 'Could not update company profile.' }, { status: 400 });
    return Response.json({ organization: data });
  }
  if (action === 'membership') {
    const memberId = safeText(body?.memberId, 120); const status = body?.status;
    if (!memberId || !['active', 'suspended'].includes(String(status))) return Response.json({ error: 'Member and valid membership status are required.' }, { status: 400 });
    const { data: target } = await auth.admin.from('organization_members').select('id,auth_user_id,role').eq('id', memberId).eq('organization_id', auth.organizationId).maybeSingle();
    if (!target || target.auth_user_id === auth.userId) return Response.json({ error: 'You cannot change your own company membership.' }, { status: 403 });
    const { data, error } = await auth.admin.from('organization_members').update({ status }).eq('id', target.id).select('id,auth_user_id,email,name,role,status').single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ member: data });
  }
  return Response.json({ error: 'Unsupported company administration action.' }, { status: 400 });
}
