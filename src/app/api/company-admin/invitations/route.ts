import { authorizeCompanyAdmin } from '../../../../lib/server/companyAdmin';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export async function POST(request: Request) {
  const limited = rateLimit({ key: `company-invites:${getClientIp(request)}`, limit: 15, windowMs: 60_000 });
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const auth = await authorizeCompanyAdmin(request);
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as { email?: string; name?: string; role?: string } | null;
  const email = body?.email?.trim().toLowerCase(); const name = body?.name?.trim(); const role = body?.role;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !name || !['business_admin','project_director'].includes(String(role))) return Response.json({ error: 'Name, email and an allowed company role are required.' }, { status: 400 });
  if (role === 'business_admin' && auth.role !== 'project_director') return Response.json({ error: 'Only a Project Director can invite another Company Admin.' }, { status: 403 });
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const { data: invited, error: inviteError } = await auth.admin.auth.admin.inviteUserByEmail(email, {
    data: { name: name.slice(0, 160), organization_id: auth.organizationId, invited_role: role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/invite`,
  });
  if (inviteError || !invited.user) return Response.json({ error: inviteError?.message || 'Could not send the account invitation.' }, { status: 400 });
  const { data, error } = await auth.admin.from('organization_invitations').upsert({ organization_id: auth.organizationId, email, name: name.slice(0,160), role, token_hash: await digest(token), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), status: 'invited', invited_by: auth.userId }, { onConflict: 'organization_id,email' }).select('id,email,name,role,status,expires_at').single();
  if (error || !data) return Response.json({ error: error?.message || 'Could not create invitation.' }, { status: 400 });
  const { error: membershipError } = await auth.admin.from('organization_members').upsert({ id: `${auth.organizationId}-${invited.user.id}`, organization_id: auth.organizationId, auth_user_id: invited.user.id, email, name: name.slice(0,160), role, status: 'invited' }, { onConflict: 'organization_id,auth_user_id' });
  if (membershipError) return Response.json({ error: `Invitation created but membership could not be prepared: ${membershipError.message}` }, { status: 400 });
  // Supabase owns the non-guessable, single-use email invitation token. CTMS
  // never exposes it in an API response or browser state.
  return Response.json({ invitation: data, delivery: 'sent' }, { status: 201 });
}
async function digest(value: string) { const bytes = new TextEncoder().encode(value); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2,'0')).join(''); }
