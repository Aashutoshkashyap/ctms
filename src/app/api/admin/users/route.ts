import { createClient } from '@supabase/supabase-js';
import { buildDefaultPermissions, DIRECTOR_MANAGED_FEATURES, isProjectDirector, PROJECT_ROLES } from '../../../../lib/permissions';
import type { Feature, FeaturePermissions, PermissionLevel } from '../../../../lib/permissions';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `admin-users:${ip}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!url || !secretKey) {
    return Response.json({ error: 'Server-side Supabase administration is not configured.' }, { status: 503 });
  }
  if (!accessToken) {
    return Response.json({ error: 'Authentication is required.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    name?: string;
    email?: string;
    role?: string;
    projectId?: string;
    temporaryPassword?: string;
    featurePermissions?: FeaturePermissions;
  } | null;
  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  const role = body?.role;
  const projectId = body?.projectId;
  const requestedPassword = body?.temporaryPassword || '';

  if (!name || !email || !role || role === 'super_admin' || !projectId || !PROJECT_ROLES.includes(role as typeof PROJECT_ROLES[number])) {
    return Response.json({ error: 'Name, email, project and a valid role are required.' }, { status: 400 });
  }
  if (requestedPassword && (requestedPassword.length < 10 || !/[a-z]/.test(requestedPassword) || !/[A-Z]/.test(requestedPassword) || !/\d/.test(requestedPassword))) {
    return Response.json({ error: 'The temporary password must be at least 10 characters and include upper-case, lower-case and a number.' }, { status: 400 });
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: requester, error: requesterError } = await admin.auth.getUser(accessToken);
  if (requesterError || !requester.user) {
    return Response.json({ error: 'Your session could not be verified.' }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await admin
    .from('project_users')
    .select('role')
    .eq('project_id', projectId)
    .eq('auth_user_id', requester.user.id)
    .maybeSingle();
  const requesterIsDirector = Boolean(membership && isProjectDirector(membership.role));
  if (membershipError || !membership || (!requesterIsDirector && membership.role !== 'business_admin')) {
    return Response.json({ error: 'Only the Project Director or Business Admin can provision user accounts.' }, { status: 403 });
  }
  if (membership.role === 'business_admin' && ['project_director', 'business_admin'].includes(role)) {
    return Response.json({ error: 'A Business Admin cannot grant Director or administrator access.' }, { status: 403 });
  }
  const featurePermissions = requesterIsDirector
    ? sanitizeFeaturePermissions(body?.featurePermissions || buildDefaultPermissions(role))
    : buildDefaultPermissions(role);

  const { data: projectRecord, error: projectError } = await admin
    .from('projects')
    .select('id,organization_id')
    .eq('id', projectId)
    .single();
  if (projectError || !projectRecord?.organization_id) {
    return Response.json({ error: 'The project is not linked to a business tenant.' }, { status: 400 });
  }
  const organizationId = projectRecord.organization_id;
  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('id,subscription_status,access_until,seat_limit')
    .eq('id', organizationId)
    .single();
  if (organizationError || !organization) {
    return Response.json({ error: 'The business subscription could not be verified.' }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!['trial', 'active', 'past_due'].includes(organization.subscription_status) || (organization.access_until && organization.access_until < today)) {
    return Response.json({ error: 'This business subscription is inactive or expired.' }, { status: 403 });
  }

  const { data: tenantProjects } = await admin.from('projects').select('id').eq('organization_id', organizationId);
  const tenantProjectIds = (tenantProjects || []).map(item => item.id);
  const { data: tenantMemberships } = tenantProjectIds.length
    ? await admin.from('project_users').select('auth_user_id,email').in('project_id', tenantProjectIds)
    : { data: [] as Array<{ auth_user_id: string | null; email: string }> };
  const usedSeats = new Set((tenantMemberships || []).map(item => item.auth_user_id).filter(Boolean)).size;

  const { data: matchingMemberships } = await admin
    .from('project_users')
    .select('auth_user_id,project_id,name,email,role')
    .eq('email', email);
  const matchingProjectIds = [...new Set((matchingMemberships || []).map(item => item.project_id))];
  const { data: matchingProjects } = matchingProjectIds.length
    ? await admin.from('projects').select('id,organization_id').in('id', matchingProjectIds)
    : { data: [] as Array<{ id: string; organization_id: string | null }> };
  const matchingOrganizations = new Set((matchingProjects || []).map(item => item.organization_id).filter(Boolean));
  if ([...matchingOrganizations].some(id => id !== organizationId)) {
    return Response.json({ error: 'That email already belongs to another business tenant.' }, { status: 409 });
  }

  const existingMembership = (matchingMemberships || []).find(item =>
    (matchingProjects || []).some(projectRow => projectRow.id === item.project_id && projectRow.organization_id === organizationId)
  );
  if (existingMembership?.auth_user_id) {
    const { data: assigned, error: assignmentError } = await admin.from('project_users').upsert({
      id: `${projectId}-${existingMembership.auth_user_id}`,
      auth_user_id: existingMembership.auth_user_id,
      project_id: projectId,
      email,
      name,
      role,
      feature_permissions: featurePermissions,
    }, { onConflict: 'project_id,email' }).select('id,auth_user_id,project_id,email,name,role,feature_permissions').single();
    if (assignmentError || !assigned) {
      return Response.json({ error: assignmentError?.message || 'Could not assign the existing employee.' }, { status: 400 });
    }
    if (['business_admin', 'project_director'].includes(role)) {
      const { error: leaderError } = await admin.from('organization_members').upsert({
        id: `${organizationId}-${existingMembership.auth_user_id}`,
        organization_id: organizationId,
        auth_user_id: existingMembership.auth_user_id,
        email,
        name,
        role,
        status: 'active',
      }, { onConflict: 'organization_id,auth_user_id' });
      if (leaderError) return Response.json({ error: leaderError.message }, { status: 400 });
    }
    return Response.json({ user: assigned, temporaryPassword: null, reusedAccount: true });
  }

  if (usedSeats >= Number(organization.seat_limit || 0)) {
    return Response.json({ error: `Employee seat limit reached (${usedSeats}/${organization.seat_limit}).` }, { status: 409 });
  }

  const temporaryPassword = requestedPassword || `BT-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}!a9`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { name, role, organization_id: organizationId }
  });
  if (createError || !created.user) {
    return Response.json(
      { error: createError?.message || 'Could not create the Supabase user.' },
      { status: createError?.message.toLowerCase().includes('already') ? 409 : 400 }
    );
  }

  const { error: profileError } = await admin.from('project_users').upsert({
    id: `${projectId}-${created.user.id}`,
    auth_user_id: created.user.id,
    project_id: projectId,
    email,
    name,
    role,
    feature_permissions: featurePermissions,
  }, { onConflict: 'project_id,email' });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: `Account rollback: ${profileError.message}` }, { status: 400 });
  }

  if (['business_admin', 'project_director'].includes(role)) {
    const { error: leaderError } = await admin.from('organization_members').upsert({
      id: `${organizationId}-${created.user.id}`,
      organization_id: organizationId,
      auth_user_id: created.user.id,
      email,
      name,
      role,
      status: 'active',
    }, { onConflict: 'organization_id,auth_user_id' });
    if (leaderError) {
      await admin.from('project_users').delete().eq('project_id', projectId).eq('auth_user_id', created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      return Response.json({ error: `Account rollback: ${leaderError.message}` }, { status: 400 });
    }
  }

  return Response.json({
    user: { id: created.user.id, auth_user_id: created.user.id, project_id: projectId, name, email, role, feature_permissions: featurePermissions },
    temporaryPassword
  });
}

const permissionValues = new Set<PermissionLevel>(['none', 'read', 'write']);
const managedFeatures = new Set(DIRECTOR_MANAGED_FEATURES.map(item => item.feature));

function sanitizeFeaturePermissions(input: FeaturePermissions) {
  return Object.fromEntries(Object.entries(input).filter(([feature, value]) => managedFeatures.has(feature as Feature) && permissionValues.has(value as PermissionLevel))) as FeaturePermissions;
}

export async function PATCH(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `admin-users-update:${ip}`, limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!url || !secretKey) return Response.json({ error: 'Server-side Supabase administration is not configured.' }, { status: 503 });
  if (!accessToken) return Response.json({ error: 'Authentication is required.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { projectId?: string; membershipId?: string; role?: string; featurePermissions?: FeaturePermissions } | null;
  if (!body?.projectId || !body.membershipId || !body.role || !PROJECT_ROLES.includes(body.role as typeof PROJECT_ROLES[number]) || ['super_admin','project_director','business_admin'].includes(body.role)) {
    return Response.json({ error: 'Project, staff membership and a staff role are required.' }, { status: 400 });
  }
  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: requester, error: requesterError } = await admin.auth.getUser(accessToken);
  if (requesterError || !requester.user) return Response.json({ error: 'Your session could not be verified.' }, { status: 401 });
  const { data: director } = await admin.from('project_users').select('role').eq('project_id', body.projectId).eq('auth_user_id', requester.user.id).maybeSingle();
  if (!director || !isProjectDirector(director.role)) return Response.json({ error: 'Only the Project Director can change staff feature access.' }, { status: 403 });
  const { data: target } = await admin.from('project_users').select('id,role,auth_user_id').eq('id', body.membershipId).eq('project_id', body.projectId).maybeSingle();
  if (!target || ['project_director','business_admin','super_admin'].includes(target.role) || target.auth_user_id === requester.user.id) {
    return Response.json({ error: 'Director and administrator memberships cannot be changed from the staff access editor.' }, { status: 403 });
  }
  const { data, error } = await admin.from('project_users').update({
    role: body.role,
    feature_permissions: sanitizeFeaturePermissions(body.featurePermissions || buildDefaultPermissions(body.role)),
  }).eq('id', target.id).select('id,auth_user_id,project_id,email,name,role,feature_permissions').single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ user: data });
}
