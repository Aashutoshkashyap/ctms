import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { can, normalizeRole, type Feature } from '../permissions';
import { authorizeActiveOrganizationMember } from './projectAuthorization';

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
): Promise<GoogleProjectAuthorization | { error: string; status: number }> {
  const { data: project } = await admin.from('projects').select('id,name,organization_id').eq('id', projectId).maybeSingle();
  if (!project?.organization_id) return { error: 'Project business tenant was not found.', status: 404 };

  const organization = await authorizeActiveOrganizationMember(admin, userId, project.organization_id);
  if ('error' in organization) return organization;
  const membership = await admin.from('project_users').select('role,feature_permissions').eq('project_id', projectId).eq('auth_user_id', userId).maybeSingle();
  const role = normalizeRole(membership.data?.role || '');
  if (membership.error || !membership.data || !allowedRoles.includes(role)) return { error: 'You are not authorized for this Google workspace action.', status: 403 };

  return {
    admin,
    userId,
    role,
    project: {
      id: project.id,
      name: project.name,
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
    },
  };
}

export async function authorizeGoogleRequest(request: Request, projectId: string, allowedRoles: string[]) {
  const admin = adminClient();
  if (!admin) return { error: 'Server-side tenant storage is not configured.', status: 503 } as const;
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return { error: 'Authentication is required.', status: 401 } as const;
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) return { error: 'Your session could not be verified.', status: 401 } as const;
  return loadAuthorization(admin, data.user.id, projectId, allowedRoles);
}

export async function authorizeGoogleCallbackUser(userId: string, projectId: string, allowedRoles: string[]) {
  const admin = adminClient();
  if (!admin) return { error: 'Server-side tenant storage is not configured.', status: 503 } as const;
  return loadAuthorization(admin, userId, projectId, allowedRoles);
}

// Uploads are an evidence mutation, so role eligibility is not enough.
export async function authorizeGoogleUploadRequest(request: Request, projectId: string, allowedRoles: string[]) {
  const authorization = await authorizeGoogleRequest(request, projectId, allowedRoles);
  if ('error' in authorization) return authorization;
  const membership = await authorization.admin.from('project_users').select('role,feature_permissions').eq('project_id', projectId).eq('auth_user_id', authorization.userId).maybeSingle();
  if (membership.error || !membership.data || !can(membership.data.role, 'upload_evidence' as Feature, membership.data.feature_permissions, 'write')) return { error: 'Evidence upload access is not authorized.', status: 403 } as const;
  return authorization;
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
