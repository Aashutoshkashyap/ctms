import { createClient } from '@supabase/supabase-js';
import { maskCommunicationAddress, normalizeNepalWhatsAppNumber } from '../../../../lib/communicationIdentity';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';
import { authorizeProjectUser } from '../../../../lib/server/projectAuthorization';

type IdentityRow = { id: string; organization_id: string; person_id: string; channel: string; provider: string; normalized_address: string; pairing_state: string; created_at: string; updated_at: string; verified_at?: string | null; revoked_at?: string | null };

function identityView(row: IdentityRow) {
  return { id: row.id, channel: row.channel, provider: row.provider, address: maskCommunicationAddress(row.normalized_address), pairingState: row.pairing_state, createdAt: row.created_at, updatedAt: row.updated_at, verifiedAt: row.verified_at || null, revokedAt: row.revoked_at || null };
}

async function contextFor(request: Request, projectId: string, personId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!url || !secret) return { error: 'Server-side Supabase administration is not configured.', status: 503 } as const;
  if (!token) return { error: 'Authentication is required.', status: 401 } as const;
  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const verified = await admin.auth.getUser(token);
  if (verified.error || !verified.data.user) return { error: 'Your session could not be verified.', status: 401 } as const;
  const actor = await authorizeProjectUser(admin, verified.data.user.id, projectId, 'manage_users', 'write');
  if ('error' in actor) return actor;
  const target = await admin.from('project_users').select('auth_user_id').eq('project_id', projectId).eq('auth_user_id', personId).maybeSingle();
  if (target.error || !target.data?.auth_user_id) return { error: 'The target person is not assigned to this project.', status: 403 } as const;
  return { admin, actor, personId } as const;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId') || '';
  const personId = url.searchParams.get('personId') || '';
  const context = await contextFor(request, projectId, personId);
  if ('error' in context) return Response.json({ error: context.error }, { status: context.status });
  const { data, error } = await context.admin.from('communication_identities').select('id,organization_id,person_id,channel,provider,normalized_address,pairing_state,created_at,updated_at,verified_at,revoked_at').eq('organization_id', context.actor.project.organizationId).eq('person_id', personId).order('updated_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ identities: (data || []).map(identityView) });
}

export async function POST(request: Request) {
  const limit = rateLimit({ key: `communication-pair:${getClientIp(request)}`, limit: 10, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.json().catch(() => null) as { projectId?: string; personId?: string; phone?: string } | null;
  if (!body?.projectId || !body.personId || !body.phone) return Response.json({ error: 'Project, person, and a Nepal mobile number are required.' }, { status: 400 });
  const number = normalizeNepalWhatsAppNumber(body.phone);
  if (!number) return Response.json({ error: 'Use a valid Nepal mobile number, for example +9779812345678.' }, { status: 400 });
  const context = await contextFor(request, body.projectId, body.personId);
  if ('error' in context) return Response.json({ error: context.error }, { status: context.status });
  const active = await context.admin.from('communication_identities').select('id,person_id,pairing_state').eq('organization_id', context.actor.project.organizationId).eq('channel', 'WHATSAPP').eq('provider', 'GENERIC').eq('normalized_address', number).neq('pairing_state', 'REVOKED').maybeSingle();
  if (active.error) return Response.json({ error: active.error.message }, { status: 400 });
  if (active.data && active.data.person_id !== body.personId) return Response.json({ error: 'This WhatsApp number is already paired or pending for another person in this business.' }, { status: 409 });
  if (active.data) return Response.json({ error: 'This WhatsApp number is already pending for this person.', identityId: active.data.id }, { status: 409 });
  const existingForPerson = await context.admin.from('communication_identities').select('id').eq('organization_id', context.actor.project.organizationId).eq('person_id', body.personId).eq('channel', 'WHATSAPP').eq('provider', 'GENERIC').neq('pairing_state', 'REVOKED').maybeSingle();
  if (existingForPerson.error) return Response.json({ error: existingForPerson.error.message }, { status: 400 });
  if (existingForPerson.data) return Response.json({ error: 'Revoke the existing WhatsApp pairing before starting another one.', identityId: existingForPerson.data.id }, { status: 409 });
  const now = new Date().toISOString();
  const id = `communication-${crypto.randomUUID()}`;
  const { data, error } = await context.admin.from('communication_identities').insert({ id, organization_id: context.actor.project.organizationId, person_id: body.personId, channel: 'WHATSAPP', provider: 'GENERIC', normalized_address: number, pairing_state: 'PENDING', created_by: context.actor.userId, created_at: now, updated_at: now }).select('id,organization_id,person_id,channel,provider,normalized_address,pairing_state,created_at,updated_at,verified_at,revoked_at').single();
  if (error || !data) return Response.json({ error: error?.message || 'Could not start pairing.' }, { status: 400 });
  await context.admin.from('app_notifications').insert({ id: `communication-audit-${crypto.randomUUID()}`, project_id: body.projectId, organization_id: context.actor.project.organizationId, actor_person_id: context.actor.userId, action: 'WhatsApp pairing initiated', module: 'Communication identity', detail: `Pairing initiated for person ${body.personId}.`, event_type: 'communication_identity_pairing_initiated', record_id: id, source: 'WEB', delivery_channel: 'BUILDTRACK', delivery_status: 'recorded', read: false });
  return Response.json({ identity: identityView(data), pairing: 'pending_verification' }, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { projectId?: string; personId?: string; identityId?: string; action?: 'revoke' | 'remove' } | null;
  if (!body?.projectId || !body.personId || !body.identityId || !body.action) return Response.json({ error: 'Project, person, identity, and action are required.' }, { status: 400 });
  const context = await contextFor(request, body.projectId, body.personId);
  if ('error' in context) return Response.json({ error: context.error }, { status: context.status });
  const result = body.action === 'remove'
    ? await context.admin.from('communication_identities').delete().eq('id', body.identityId).eq('organization_id', context.actor.project.organizationId).eq('person_id', body.personId)
    : await context.admin.from('communication_identities').update({ pairing_state: 'REVOKED', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.identityId).eq('organization_id', context.actor.project.organizationId).eq('person_id', body.personId);
  if (result.error) return Response.json({ error: result.error.message }, { status: 400 });
  await context.admin.from('app_notifications').insert({ id: `communication-audit-${crypto.randomUUID()}`, project_id: body.projectId, organization_id: context.actor.project.organizationId, actor_person_id: context.actor.userId, action: `WhatsApp pairing ${body.action}d`, module: 'Communication identity', detail: `Pairing ${body.action}d for person ${body.personId}.`, event_type: `communication_identity_${body.action}d`, record_id: body.identityId, source: 'WEB', delivery_channel: 'BUILDTRACK', delivery_status: 'recorded', read: false });
  return Response.json({ ok: true, action: body.action });
}
