import { tenantAdminClient, bearerToken } from '../../../../../lib/server/projectAuthorization';

export async function POST(request: Request) {
  const token = bearerToken(request); const admin = tenantAdminClient();
  if (!token) return Response.json({ error: 'Authentication is required.' }, { status: 401 });
  if (!admin) return Response.json({ error: 'Tenant administration is not configured.' }, { status: 503 });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user?.email) return Response.json({ error: 'Your session could not be verified.' }, { status: 401 });
  const email = auth.user.email.toLowerCase();
  const { data: invitation } = await admin.from('organization_invitations').select('id,organization_id,email,status,expires_at').eq('email', email).eq('status','invited').maybeSingle();
  if (!invitation || new Date(invitation.expires_at).getTime() < Date.now()) return Response.json({ error: 'This invitation is expired, revoked or unavailable.' }, { status: 403 });
  const { error: membershipError } = await admin.from('organization_members').update({ status: 'active' }).eq('organization_id', invitation.organization_id).eq('auth_user_id', auth.user.id).eq('email', email);
  if (membershipError) return Response.json({ error: 'Could not activate company membership.' }, { status: 400 });
  await admin.from('organization_invitations').update({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invitation.id).eq('status','invited');
  return Response.json({ accepted: true });
}
