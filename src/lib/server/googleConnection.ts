import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Feature } from '../permissions';
import { authorizeProjectUser } from './projectAuthorization';

export type GoogleProjectAuthorization = {
  admin: SupabaseClient;
  userId: string;
  role: string;
  project: {
    id: string;
    name: string;
    organizationId: string;
    organizationName: string;
  };
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return null;
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function loadAuthorization(
  admin: SupabaseClient,
  userId: string,
  projectId: string,
  allowedRoles: string[],
  feature: Feature = 'settings',
  access: 'read' | 'write' = 'write',
): Promise<GoogleProjectAuthorization | { error: string; status: number }> {
  const authorized = await authorizeProjectUser(admin, userId, projectId, feature, access);
  if ('error' in authorized) return authorized;
  if (!allowedRoles.includes(authorized.role)) return { error: 'This Google action is not authorized.', status: 403 };
  return authorized;
}

export async function authorizeGoogleRequest(request: Request, projectId: string, allowedRoles: string[], feature: Feature = 'settings', access: 'read' | 'write' = 'write') {
  const admin = adminClient();
  if (!admin) return { error: 'Server-side tenant storage is not configured.', status: 503 } as const;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return { error: 'Authentication is required.', status: 401 } as const;
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) return { error: 'Your session could not be verified.', status: 401 } as const;
  return loadAuthorization(admin, data.user.id, projectId, allowedRoles, feature, access);
}

export async function authorizeGoogleCallbackUser(userId: string, projectId: string, allowedRoles: string[]) {
  const admin = adminClient();
  if (!admin) return { error: 'Server-side tenant storage is not configured.', status: 503 } as const;
  return loadAuthorization(admin, userId, projectId, allowedRoles);
}

export async function readGoogleConnection(admin: SupabaseClient, projectId: string) {
  const { data, error } = await admin
    .from('google_connections')
    .select('id,organization_id,project_id,connected_by,google_email,root_folder_id,project_folder_id,daily_folder_id,expense_folder_id,employee_folder_id,document_folder_id,photo_folder_id,sheet_id,encrypted_refresh_token,status,created_at,updated_at')
    .eq('project_id', projectId)
    .eq('status', 'connected')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
