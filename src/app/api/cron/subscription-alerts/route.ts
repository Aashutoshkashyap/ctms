import { NextResponse } from 'next/server';
import { getPlatformAdminClient } from '../../../../lib/server/platformAdmin';
import { deliverSubscriptionEmailQueue } from '../../../../lib/server/subscriptionEmail';

export const dynamic = 'force-dynamic';

function kathmanduDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function diffDays(fromDate: string, toDate: string) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: 'Unauthorized subscription alert request.' }, { status: 401 });
  }
  const admin = getPlatformAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: 'Platform database is not configured.' }, { status: 503 });
  const today = kathmanduDate();
  const { data: organizations, error } = await admin
    .from('organizations')
    .select('id,name,contact_email,access_until,subscription_status')
    .not('access_until', 'is', null);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  let noticesCreated = 0;
  let deliveriesQueued = 0;
  let expiredUpdated = 0;
  for (const organization of organizations || []) {
    const accessUntil = organization.access_until as string;
    const daysBefore = diffDays(today, accessUntil);
    if (daysBefore < 0 && !['past_due', 'suspended', 'cancelled'].includes(organization.subscription_status)) {
      await admin.from('organizations').update({ subscription_status: 'past_due', updated_at: new Date().toISOString() }).eq('id', organization.id);
      expiredUpdated += 1;
    }
    if (![5, 3, 1, 0].includes(daysBefore)) continue;
    const timing = daysBefore === 0 ? 'expires today' : `expires in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`;
    const severity = daysBefore <= 1 ? 'critical' : 'warning';
    const notificationId = `subscription-${organization.id}-${accessUntil}-${daysBefore}`;
    const { data: notice, error: noticeError } = await admin.from('organization_notifications').upsert({
      id: notificationId,
      organization_id: organization.id,
      kind: 'subscription_expiry',
      title: daysBefore === 0 ? 'Subscription expires today' : `Subscription expires in ${daysBefore} days`,
      message: `${organization.name} BuildTrack access ${timing}. Submit the payment reference to renew service.`,
      severity,
      alert_for_date: accessUntil,
      days_before: daysBefore,
      visible_until: addDays(accessUntil, 7),
    }, { onConflict: 'organization_id,kind,alert_for_date,days_before', ignoreDuplicates: false }).select('id').single();
    if (noticeError) continue;
    noticesCreated += 1;
    if (organization.contact_email && /^\S+@\S+\.\S+$/.test(organization.contact_email)) {
      const deliveryId = `renewal-email-${organization.id}-${accessUntil}-${daysBefore}`;
      const { error: deliveryError } = await admin.from('subscription_email_deliveries').upsert({
        id: deliveryId,
        organization_id: organization.id,
        notification_id: notice?.id || notificationId,
        recipient: organization.contact_email.toLowerCase(),
        subject: daysBefore === 0 ? 'BuildTrack access expires today' : `BuildTrack access expires in ${daysBefore} days`,
        scheduled_for: today,
        days_before: daysBefore,
        status: 'queued',
      }, { onConflict: 'organization_id,recipient,scheduled_for,days_before', ignoreDuplicates: true });
      if (!deliveryError) deliveriesQueued += 1;
    }
  }

  const delivery = await deliverSubscriptionEmailQueue(admin);
  return NextResponse.json({
    ok: true,
    date: today,
    organizationsChecked: organizations?.length || 0,
    noticesCreated,
    deliveriesQueued,
    expiredUpdated,
    delivery,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
