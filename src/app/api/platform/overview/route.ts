import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  DEMO_SESSION_COOKIE,
  getClientIp,
  rateLimit,
  rateLimitResponse,
  readDemoSession,
} from '../../../../lib/server/security';

async function authorizePlatformOwner(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return { error: 'Platform administration is not configured.', status: 503 } as const;

  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (accessToken) {
    const { data, error } = await admin.auth.getUser(accessToken);
    if (!error && data.user) {
      const { data: platformAdmin } = await admin
        .from('platform_admins')
        .select('auth_user_id')
        .eq('auth_user_id', data.user.id)
        .maybeSingle();
      if (platformAdmin) return { admin, actorId: data.user.id } as const;
    }
  }

  const cookieStore = await cookies();
  const demo = await readDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  if (demo?.role === 'super_admin') {
    const { data: platformAdmin } = await admin
      .from('platform_admins')
      .select('auth_user_id')
      .eq('email', demo.email)
      .maybeSingle();
    if (platformAdmin) return { admin, actorId: platformAdmin.auth_user_id } as const;
  }
  return { error: 'Platform Superadmin access is required.', status: 403 } as const;
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `platform-overview:${ip}`, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return Response.json({ error: authorization.error }, { status: authorization.status });
  const { admin } = authorization;
  const [organizations, inquiries, transactions] = await Promise.all([
    admin.from('organizations').select('id,name,contact_email,plan,subscription_status,access_until,seat_limit,project_limit,created_at').order('created_at', { ascending: false }),
    admin.from('business_inquiries').select('id,business_name,contact_name,contact_email,phone,message,status,created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(20),
    admin.from('subscription_transactions').select('id,organization_id,reference,amount,currency,paid_at,period_start,period_end,status,created_at,organization:organizations(name)', { count: 'exact' }).order('created_at', { ascending: false }).limit(20),
  ]);

  if (organizations.error) {
    return Response.json({
      schemaReady: false,
      businesses: [],
      message: 'The tenant administration migration has not been applied yet.',
    }, { status: 503 });
  }

  return Response.json({
    schemaReady: true,
    businesses: organizations.data || [],
    inquiries: {
      total: inquiries.count || 0,
      open: (inquiries.data || []).filter(item => item.status === 'new' || item.status === 'open').length,
      recent: inquiries.data || [],
    },
    transactions: {
      total: transactions.count || 0,
      pending: (transactions.data || []).filter(item => item.status === 'pending').length,
      recent: transactions.data || [],
    },
  });
}

export async function PATCH(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `platform-overview-update:${ip}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return Response.json({ error: authorization.error }, { status: authorization.status });
  const body = await request.json().catch(() => null) as {
    action?: 'organization' | 'transaction' | 'inquiry';
    organizationId?: string;
    plan?: string;
    subscriptionStatus?: string;
    accessUntil?: string | null;
    seatLimit?: number;
    projectLimit?: number;
    transactionId?: string;
    transactionStatus?: string;
    inquiryId?: string;
    inquiryStatus?: string;
  } | null;

  if (body?.action === 'transaction') {
    if (!body.transactionId || !body.transactionStatus || !['verified', 'rejected', 'refunded'].includes(body.transactionStatus)) {
      return Response.json({ error: 'A transaction and valid verification status are required.' }, { status: 400 });
    }
    const { data, error } = await authorization.admin.from('subscription_transactions').update({
      status: body.transactionStatus,
      verified_by: authorization.actorId,
      verified_at: new Date().toISOString(),
    }).eq('id', body.transactionId).select('id,organization_id,reference,amount,currency,paid_at,period_start,period_end,status,created_at,organization:organizations(name)').single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ transaction: data });
  }

  if (body?.action === 'inquiry') {
    if (!body.inquiryId || !body.inquiryStatus || !['open', 'contacted', 'converted', 'closed'].includes(body.inquiryStatus)) {
      return Response.json({ error: 'An inquiry and valid response status are required.' }, { status: 400 });
    }
    const { data, error } = await authorization.admin.from('business_inquiries').update({ status: body.inquiryStatus })
      .eq('id', body.inquiryId)
      .select('id,business_name,contact_name,contact_email,phone,message,status,created_at')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ inquiry: data });
  }

  if (!body?.organizationId) return Response.json({ error: 'Business tenant is required.' }, { status: 400 });
  const allowedStatuses = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];
  if (body.subscriptionStatus && !allowedStatuses.includes(body.subscriptionStatus)) {
    return Response.json({ error: 'Invalid subscription status.' }, { status: 400 });
  }
  if (body.seatLimit !== undefined && (!Number.isInteger(body.seatLimit) || body.seatLimit < 1 || body.seatLimit > 1000)) {
    return Response.json({ error: 'Employee seat limit must be between 1 and 1000.' }, { status: 400 });
  }
  if (body.projectLimit !== undefined && (!Number.isInteger(body.projectLimit) || body.projectLimit < 1 || body.projectLimit > 100)) {
    return Response.json({ error: 'Project limit must be between 1 and 100.' }, { status: 400 });
  }

  const changes = {
    ...(body.plan ? { plan: body.plan.trim().slice(0, 60) } : {}),
    ...(body.subscriptionStatus ? { subscription_status: body.subscriptionStatus } : {}),
    ...(body.accessUntil !== undefined ? { access_until: body.accessUntil || null } : {}),
    ...(body.seatLimit !== undefined ? { seat_limit: body.seatLimit } : {}),
    ...(body.projectLimit !== undefined ? { project_limit: body.projectLimit } : {}),
  };
  const { data, error } = await authorization.admin
    .from('organizations')
    .update(changes)
    .eq('id', body.organizationId)
    .select('id,name,contact_email,plan,subscription_status,access_until,seat_limit,project_limit,created_at')
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ business: data });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `platform-onboard:${ip}`, limit: 10, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return Response.json({ error: authorization.error }, { status: authorization.status });
  const body = await request.json().catch(() => null) as {
    businessName?: string;
    contactEmail?: string;
    adminName?: string;
    plan?: string;
    accessUntil?: string;
    seatLimit?: number;
    projectLimit?: number;
  } | null;
  const businessName = body?.businessName?.trim();
  const contactEmail = body?.contactEmail?.trim().toLowerCase();
  const adminName = body?.adminName?.trim();
  if (!businessName || !adminName || !contactEmail || !/^\S+@\S+\.\S+$/.test(contactEmail)) {
    return Response.json({ error: 'Business name, administrator name and a valid email are required.' }, { status: 400 });
  }

  const organizationId = `org-${crypto.randomUUID()}`;
  const projectId = `proj-${crypto.randomUUID()}`;
  const temporaryPassword = `BT-${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}!a9`;
  const accessUntil = body?.accessUntil || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const startDate = new Date().toISOString().slice(0, 10);
  const target = new Date(`${startDate}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 365);
  const { admin } = authorization;

  const { data: organization, error: organizationError } = await admin.from('organizations').insert({
    id: organizationId,
    name: businessName,
    contact_email: contactEmail,
    plan: body?.plan?.trim() || 'trial',
    subscription_status: 'trial',
    access_until: accessUntil,
    seat_limit: Math.min(1000, Math.max(1, Number(body?.seatLimit) || 25)),
    project_limit: Math.min(100, Math.max(1, Number(body?.projectLimit) || 5)),
  }).select('id,name,contact_email,plan,subscription_status,access_until,seat_limit,project_limit,created_at').single();
  if (organizationError || !organization) return Response.json({ error: organizationError?.message || 'Could not create the business.' }, { status: 400 });

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: contactEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { name: adminName, role: 'business_admin', organization_id: organizationId },
  });
  if (userError || !created.user) {
    await admin.from('organizations').delete().eq('id', organizationId);
    return Response.json({ error: userError?.message || 'Could not create the administrator login.' }, { status: 400 });
  }

  const setupRows = await Promise.all([
    admin.from('organization_members').insert({ id: `${organizationId}-${created.user.id}`, organization_id: organizationId, auth_user_id: created.user.id, email: contactEmail, name: adminName, role: 'business_admin', status: 'active' }),
    admin.from('projects').insert({
      id: projectId,
      created_by: created.user.id,
      organization_id: organizationId,
      organization_name: businessName,
      name: `${businessName} - Project Workspace`,
      contract_number: 'TO-BE-ASSIGNED',
      contract_amount: 0,
      currency: 'NPR',
      start_date: startDate,
      contract_duration_days: 365,
      target_completion_date: target.toISOString().slice(0, 10),
      jv_status: 'solo',
      lead_partner: businessName,
      other_partners: [],
      status: 'active',
      access_until: accessUntil,
    }),
  ]);
  const setupError = setupRows.find(result => result.error)?.error;
  if (setupError) {
    await admin.from('projects').delete().eq('id', projectId);
    await admin.from('organization_members').delete().eq('organization_id', organizationId);
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from('organizations').delete().eq('id', organizationId);
    return Response.json({ error: `Tenant setup rollback: ${setupError.message}` }, { status: 400 });
  }

  const { error: membershipError } = await admin.from('project_users').insert({
    id: `${projectId}-${created.user.id}`,
    auth_user_id: created.user.id,
    project_id: projectId,
    email: contactEmail,
    name: adminName,
    role: 'business_admin',
  });
  if (membershipError) {
    await admin.from('projects').delete().eq('id', projectId);
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from('organizations').delete().eq('id', organizationId);
    return Response.json({ error: `Tenant membership rollback: ${membershipError.message}` }, { status: 400 });
  }

  return Response.json({ business: organization, administrator: { name: adminName, email: contactEmail }, temporaryPassword }, { status: 201 });
}
