import type { SupabaseClient } from '@supabase/supabase-js';
import {
  decryptGoogleRefreshToken,
  getGoogleWorkspaceConfig,
  refreshAccessToken,
  sendGmailMessage,
} from './googleWorkspace';

type DeliveryRow = {
  id: string;
  recipient: string;
  subject: string;
  days_before?: number | null;
  attempt_count?: number | null;
};

export async function sendQueuedSubscriptionEmail(admin: SupabaseClient, delivery: DeliveryRow) {
  const attemptedAt = new Date().toISOString();
  const { data: connection } = await admin
    .from('platform_email_connections')
    .select('encrypted_refresh_token,status')
    .eq('id', 'platform-gmail')
    .eq('status', 'connected')
    .maybeSingle();
  const config = getGoogleWorkspaceConfig();
  if (!config || !connection?.encrypted_refresh_token) {
    await admin.from('subscription_email_deliveries').update({
      status: 'queued',
      provider: 'gmail',
      error_message: 'Connect the platform Gmail sender to deliver this queued alert.',
      last_attempt_at: attemptedAt,
    }).eq('id', delivery.id);
    return { sent: false, queued: true };
  }

  const days = Number(delivery.days_before ?? 0);
  const timing = days === 0 ? 'expires today' : `expires in ${days} day${days === 1 ? '' : 's'}`;
  const paymentReceipt = delivery.subject.toLowerCase().includes('payment verified');
  const message = paymentReceipt
    ? [
      'BuildTrack subscription payment confirmation', '',
      'Your subscription payment has been verified and the updated validity period is now active in the tenant dashboard.',
      'Sign in to BuildTrack to view the current access date.', '',
      'This is an automated service message. No project, employee, finance, document, or image data is included.',
    ].join('\n')
    : [
      'BuildTrack subscription reminder', '',
      `Your BuildTrack business access ${timing}.`,
      'Please contact the platform administrator with your payment reference to prevent interruption.', '',
      'This is an automated service message. No project, employee, finance, document, or image data is included.',
    ].join('\n');

  try {
    const refreshToken = await decryptGoogleRefreshToken(connection.encrypted_refresh_token);
    const token = await refreshAccessToken(config, refreshToken);
    const sent = await sendGmailMessage(token.access_token, delivery.recipient, delivery.subject, message);
    await Promise.all([
      admin.from('subscription_email_deliveries').update({
        status: 'sent',
        provider: 'gmail',
        provider_message_id: sent.id,
        error_message: null,
        attempt_count: Number(delivery.attempt_count || 0) + 1,
        last_attempt_at: attemptedAt,
        sent_at: attemptedAt,
      }).eq('id', delivery.id),
      admin.from('platform_email_connections').update({ last_sent_at: attemptedAt, updated_at: attemptedAt }).eq('id', 'platform-gmail'),
    ]);
    return { sent: true, queued: false };
  } catch (error) {
    await admin.from('subscription_email_deliveries').update({
      status: 'failed',
      provider: 'gmail',
      error_message: error instanceof Error ? error.message.slice(0, 500) : 'Gmail delivery failed.',
      attempt_count: Number(delivery.attempt_count || 0) + 1,
      last_attempt_at: attemptedAt,
    }).eq('id', delivery.id);
    return { sent: false, queued: false };
  }
}

export async function deliverSubscriptionEmailQueue(admin: SupabaseClient, limit = 50) {
  const { data: rows, error } = await admin
    .from('subscription_email_deliveries')
    .select('id,recipient,subject,days_before,attempt_count')
    .in('status', ['queued', 'failed'])
    .lt('attempt_count', 5)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  let sent = 0;
  let queued = 0;
  let failed = 0;
  for (const row of rows || []) {
    const result = await sendQueuedSubscriptionEmail(admin, row);
    if (result.sent) sent += 1;
    else if (result.queued) queued += 1;
    else failed += 1;
  }
  return { processed: rows?.length || 0, sent, queued, failed };
}
