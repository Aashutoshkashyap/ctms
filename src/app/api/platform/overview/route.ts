import { authorizePlatformOwner } from '../../../../lib/server/platformAdmin';
import { deliverSubscriptionEmailQueue, sendQueuedSubscriptionEmail } from '../../../../lib/server/subscriptionEmail';
import { canTransitionSubscription, isSubscriptionStatus, validPaymentTransition } from '../../../../lib/subscriptionLifecycle';
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
} from '../../../../lib/server/security';

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `platform-overview:${ip}`, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return Response.json({ error: authorization.error }, { status: authorization.status });
  const { admin } = authorization;
  const [organizations, inquiries, transactions, emailConnection, emailQueue, projects, memberships, integrations, plans] = await Promise.all([
    admin.from('organizations').select('id,name,contact_email,plan,subscription_status,access_until,seat_limit,project_limit,created_at').order('created_at', { ascending: false }),
    admin.from('business_inquiries').select('id,business_name,contact_name,contact_email,phone,message,status,created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(20),
    admin.from('subscription_transactions').select('id,organization_id,reference,amount,currency,paid_at,period_start,period_end,payment_method,notes,proof_storage_path,proof_name,status,verified_at,created_at,organization:organizations(name)', { count: 'exact' }).order('created_at', { ascending: false }).limit(100),
    admin.from('platform_email_connections').select('google_email,status,last_sent_at').eq('id', 'platform-gmail').maybeSingle(),
    admin.from('subscription_email_deliveries').select('status'),
    admin.from('projects').select('id,organization_id,status'),
    admin.from('project_users').select('project_id,auth_user_id'),
    admin.from('google_connections').select('organization_id,status'),
    admin.from('subscription_plan_versions').select('plan_code,version,display_name,description,price,currency,billing_period,effective_from,effective_until,active').eq('active', true).order('plan_code').order('version', { ascending: false }),
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
    businesses: (organizations.data || []).map((organization) => {
      const organizationProjects = (projects.data || []).filter(project => project.organization_id === organization.id);
      const tenantProjectIds = new Set(organizationProjects.map(project => project.id));
      const seats = new Set((memberships.data || []).filter(member => tenantProjectIds.has(member.project_id)).map(member => member.auth_user_id).filter(Boolean));
      const connected = (integrations.data || []).some(connection => connection.organization_id === organization.id && connection.status === 'connected');
      return { ...organization, project_count: organizationProjects.filter(project => project.status !== 'archived').length, seat_count: seats.size, google_connected: connected, onboarding_state: organizationProjects.length && seats.size ? 'ready' : 'needs_setup', payment_status: (transactions.data || []).some(transaction => transaction.organization_id === organization.id && transaction.status === 'pending') ? 'awaiting_verification' : 'clear' };
    }),
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
    email: {
      connected: emailConnection.data?.status === 'connected',
      senderEmail: emailConnection.data?.google_email || null,
      lastSentAt: emailConnection.data?.last_sent_at || null,
      queued: (emailQueue.data || []).filter(item => item.status === 'queued').length,
      failed: (emailQueue.data || []).filter(item => item.status === 'failed').length,
    },
    plans: plans.data || [],
  });
}

export async function PATCH(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `platform-overview-update:${ip}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);

  const authorization = await authorizePlatformOwner(request);
  if ('error' in authorization) return Response.json({ error: authorization.error }, { status: authorization.status });
  const body = await request.json().catch(() => null) as {
    action?: 'organization' | 'transaction' | 'inquiry' | 'email_queue';
    organizationId?: string;
    plan?: string;
    subscriptionStatus?: string;
    accessUntil?: string | null;
    seatLimit?: number;
    projectLimit?: number;
    transactionId?: string;
    transactionStatus?: string;
    renewUntil?: string | null;
    inquiryId?: string;
    inquiryStatus?: string;
  } | null;

  if (body?.action === 'email_queue') {
    const delivery = await deliverSubscriptionEmailQueue(authorization.admin);
    return Response.json({ delivery });
  }

  if (body?.action === 'transaction') {
    if (!body.transactionId || !body.transactionStatus || !['verified', 'rejected', 'refunded'].includes(body.transactionStatus)) {
      return Response.json({ error: 'A transaction and valid verification status are required.' }, { status: 400 });
    }
    const { data: current, error: currentError } = await authorization.admin
      .from('subscription_transactions')
      .select('id,organization_id,period_end,status')
      .eq('id', body.transactionId)
      .single();
    if (currentError || !current) return Response.json({ error: currentError?.message || 'Transaction was not found.' }, { status: 404 });
    const renewUntil = body.transactionStatus === 'verified' ? (body.renewUntil || current.period_end || null) : null;
    if (renewUntil && !/^\d{4}-\d{2}-\d{2}$/.test(renewUntil)) return Response.json({ error: 'Renewal end date must be valid.' }, { status: 400 });
    if (body.transactionStatus === 'verified' && !renewUntil) return Response.json({ error: 'Choose the tenant access date before verifying payment.' }, { status: 400 });
    if (body.transactionStatus === 'verified') {
      const { data: result, error } = await authorization.admin.rpc('verify_subscription_payment', {
        target_transaction_id: body.transactionId,
        verifier_user_id: authorization.actorId,
        requested_access_until: renewUntil,
      });
      if (error) return Response.json({ error: error.message }, { status: error.code === 'P0002' ? 404 : 409 });
      const outcome = result as { result?: string; email_delivery_id?: string | null } | null;
      const { data: transaction } = await authorization.admin.from('subscription_transactions')
        .select('id,organization_id,reference,amount,currency,paid_at,period_start,period_end,payment_method,notes,proof_storage_path,proof_name,status,verified_at,created_at,organization:organizations(name)')
        .eq('id', body.transactionId).single();
      const { data: business } = await authorization.admin.from('organizations')
        .select('id,name,contact_email,plan,subscription_status,access_until,seat_limit,project_limit,created_at')
        .eq('id', current.organization_id).single();
      let emailDelivery = null;
      if (outcome?.result === 'verified' && outcome.email_delivery_id) {
        const { data: delivery } = await authorization.admin.from('subscription_email_deliveries')
          .select('id,recipient,subject,days_before,attempt_count').eq('id', outcome.email_delivery_id).maybeSingle();
        if (delivery) emailDelivery = await sendQueuedSubscriptionEmail(authorization.admin, delivery);
      }
      return Response.json({ transaction, business, emailDelivery, idempotent: outcome?.result === 'already_verified' });
    }
    if (!validPaymentTransition(current.status, body.transactionStatus)) {
      return Response.json({ error: 'This payment cannot move to the requested status.' }, { status: 409 });
    }
    const { data, error } = await authorization.admin.from('subscription_transactions').update({
      status: body.transactionStatus,
      verified_by: authorization.actorId,
      verified_at: new Date().toISOString(),
    }).eq('id', body.transactionId).eq('status', current.status).select('id,organization_id,reference,amount,currency,paid_at,period_start,period_end,payment_method,notes,proof_storage_path,proof_name,status,verified_at,created_at,organization:organizations(name)').single();
    if (error || !data) return Response.json({ error: error?.message || 'Payment was already processed.' }, { status: 409 });
    return Response.json({ transaction: data, business: null, emailDelivery: null });
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
  if (body.subscriptionStatus && !isSubscriptionStatus(body.subscriptionStatus)) {
    return Response.json({ error: 'Invalid subscription status.' }, { status: 400 });
  }
  if (body.seatLimit !== undefined && (!Number.isInteger(body.seatLimit) || body.seatLimit < 1 || body.seatLimit > 1000)) {
    return Response.json({ error: 'Employee seat limit must be between 1 and 1000.' }, { status: 400 });
  }
  if (body.projectLimit !== undefined && (!Number.isInteger(body.projectLimit) || body.projectLimit < 1 || body.projectLimit > 100)) {
    return Response.json({ error: 'Project limit must be between 1 and 100.' }, { status: 400 });
  }

  const { data: currentOrganization, error: currentOrganizationError } = await authorization.admin
    .from('organizations').select('id,subscription_status').eq('id', body.organizationId).maybeSingle();
  if (currentOrganizationError || !currentOrganization) return Response.json({ error: 'Business tenant was not found.' }, { status: 404 });
  if (body.subscriptionStatus && !canTransitionSubscription(currentOrganization.subscription_status, body.subscriptionStatus)) {
    return Response.json({ error: 'This subscription cannot move to the requested state.' }, { status: 409 });
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
    action?: 'onboard' | 'transaction';
    organizationId?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    paidAt?: string;
    periodStart?: string;
    periodEnd?: string;
    paymentMethod?: string;
    notes?: string;
    proofStoragePath?: string;
    proofName?: string;
    businessName?: string;
    contactEmail?: string;
    adminName?: string;
    plan?: string;
    accessUntil?: string;
    seatLimit?: number;
    projectLimit?: number;
  } | null;
  if (body?.action === 'transaction') {
    const organizationId = body.organizationId?.trim();
    const reference = body.reference?.trim();
    const amount = Number(body.amount);
    if (!organizationId || !reference || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'Business, payment reference and a positive amount are required.' }, { status: 400 });
    }
    if (!body.periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(body.periodEnd)) {
      return Response.json({ error: 'A subscription period end date is required.' }, { status: 400 });
    }
    const { data: organization } = await authorization.admin.from('organizations').select('id').eq('id', organizationId).maybeSingle();
    if (!organization) return Response.json({ error: 'Business tenant was not found.' }, { status: 404 });
    if (body.proofStoragePath && !body.proofStoragePath.startsWith(`${organizationId}/`)) {
      return Response.json({ error: 'Payment proof does not belong to the selected business.' }, { status: 400 });
    }
    const { data, error } = await authorization.admin.from('subscription_transactions').insert({
      organization_id: organizationId,
      reference: reference.slice(0, 120),
      amount,
      currency: (body.currency || 'NPR').trim().toUpperCase().slice(0, 3),
      paid_at: body.paidAt ? new Date(body.paidAt).toISOString() : null,
      period_start: body.periodStart || null,
      period_end: body.periodEnd,
      payment_method: body.paymentMethod?.trim().slice(0, 60) || null,
      notes: body.notes?.trim().slice(0, 1000) || null,
      proof_storage_path: body.proofStoragePath?.trim().slice(0, 500) || null,
      proof_name: body.proofName?.trim().slice(0, 180) || null,
      status: 'pending',
    }).select('id,organization_id,reference,amount,currency,paid_at,period_start,period_end,payment_method,notes,proof_storage_path,proof_name,status,verified_at,created_at,organization:organizations(name)').single();
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ transaction: data }, { status: 201 });
  }
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
