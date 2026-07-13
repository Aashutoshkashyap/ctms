import { NextResponse } from 'next/server';
import { getPlatformAdminClient } from '../../../../lib/server/platformAdmin';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const limit = rateLimit({ key: `subscription-status:${ip}`, limit: 90, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const admin = getPlatformAdminClient();
  if (!admin) return NextResponse.json({ error: 'Subscription service is not configured.' }, { status: 503 });
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: 'Your session could not be verified.' }, { status: 401 });

  let organizationId = '';
  const { data: organizationMembership } = await admin
    .from('organization_members')
    .select('organization_id,status')
    .eq('auth_user_id', auth.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  organizationId = organizationMembership?.organization_id || '';
  if (!organizationId) {
    const { data: projectMembership } = await admin
      .from('project_users')
      .select('project_id')
      .eq('auth_user_id', auth.user.id)
      .limit(1)
      .maybeSingle();
    if (projectMembership?.project_id) {
      const { data: project } = await admin.from('projects').select('organization_id').eq('id', projectMembership.project_id).maybeSingle();
      organizationId = project?.organization_id || '';
    }
  }
  if (!organizationId) return NextResponse.json({ error: 'No business tenant is assigned to this account.' }, { status: 404 });

  const currentDate = today();
  const [organization, notifications, transactions] = await Promise.all([
    admin.from('organizations').select('id,name,plan,subscription_status,access_until').eq('id', organizationId).single(),
    admin.from('organization_notifications')
      .select('id,title,message,severity,alert_for_date,days_before,created_at')
      .eq('organization_id', organizationId)
      .or(`visible_until.is.null,visible_until.gte.${currentDate}`)
      .order('created_at', { ascending: false })
      .limit(8),
    admin.from('subscription_transactions')
      .select('id,reference,amount,currency,paid_at,period_start,period_end,payment_method,status,verified_at,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (organization.error) return NextResponse.json({ error: organization.error.message }, { status: 404 });
  const accessUntil = organization.data.access_until as string | null;
  return NextResponse.json({
    organization: organization.data,
    daysRemaining: accessUntil ? dayDifference(currentDate, accessUntil) : null,
    notifications: notifications.data || [],
    transactions: transactions.data || [],
    latestTransaction: transactions.data?.[0] || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
