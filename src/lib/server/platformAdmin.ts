import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { DEMO_SESSION_COOKIE, readDemoSession } from './security';

export type PlatformAuthorization = {
  admin: SupabaseClient;
  actorId: string;
  actorEmail?: string;
};

export function getPlatformAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return null;
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function authorizePlatformOwnerById(userId: string) {
  const admin = getPlatformAdminClient();
  if (!admin) return { error: 'Platform administration is not configured.', status: 503 } as const;
  const { data: platformAdmin } = await admin
    .from('platform_admins')
    .select('auth_user_id,email')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (!platformAdmin) return { error: 'Platform Superadmin access is required.', status: 403 } as const;
  return { admin, actorId: platformAdmin.auth_user_id, actorEmail: platformAdmin.email } as PlatformAuthorization;
}

export async function authorizePlatformOwner(request: Request) {
  const admin = getPlatformAdminClient();
  if (!admin) return { error: 'Platform administration is not configured.', status: 503 } as const;

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (accessToken) {
    const { data, error } = await admin.auth.getUser(accessToken);
    if (!error && data.user) {
      const verified = await authorizePlatformOwnerById(data.user.id);
      if (!('error' in verified)) return verified;
    }
  }

  const cookieStore = await cookies();
  const demo = await readDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  if (demo?.role === 'super_admin') {
    const { data: platformAdmin } = await admin
      .from('platform_admins')
      .select('auth_user_id,email')
      .eq('email', demo.email)
      .maybeSingle();
    if (platformAdmin) return { admin, actorId: platformAdmin.auth_user_id, actorEmail: platformAdmin.email } as PlatformAuthorization;
  }
  return { error: 'Platform Superadmin access is required.', status: 403 } as const;
}
