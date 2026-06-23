import { createClient } from '@supabase/supabase-js';
import { PROJECT_ROLES } from '../../../../lib/permissions';

export async function POST(request: Request) {
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
  } | null;
  const name = body?.name?.trim();
  const email = body?.email?.trim().toLowerCase();
  const role = body?.role;
  const projectId = body?.projectId;

  if (!name || !email || !role || !projectId || !PROJECT_ROLES.includes(role as typeof PROJECT_ROLES[number])) {
    return Response.json({ error: 'Name, email, project and a valid role are required.' }, { status: 400 });
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
  if (membershipError || membership?.role !== 'project_director') {
    return Response.json({ error: 'Only the Project Director can provision user accounts.' }, { status: 403 });
  }

  const temporaryPassword = `BT-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}!a9`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { name, role }
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
    role
  }, { onConflict: 'project_id,email' });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: `Account rollback: ${profileError.message}` }, { status: 400 });
  }

  return Response.json({
    user: { id: created.user.id, auth_user_id: created.user.id, name, email, role },
    temporaryPassword
  });
}
