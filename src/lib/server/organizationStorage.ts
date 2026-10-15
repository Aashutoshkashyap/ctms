import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeProjectRequest } from './projectAuthorization';

export type OrganizationStorageProvider = 'GOOGLE_DRIVE' | 'FUTURE';
export type StorageOwnershipType = 'PERSONAL_DRIVE' | 'SHARED_DRIVE' | 'ORGANIZATION_CONTROLLED';
export type OrganizationStorageStatus = 'PENDING' | 'CONNECTED' | 'VERIFICATION_REQUIRED' | 'ERROR' | 'INACTIVE';

export type OrganizationStorageConnection = {
  id: string;
  organization_id: string;
  provider: OrganizationStorageProvider;
  ownership_type: StorageOwnershipType;
  status: OrganizationStorageStatus;
  is_active: boolean;
  root_object_id: string | null;
  shared_drive_id: string | null;
  connected_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  provider_account_hint: string | null;
  encrypted_refresh_token?: string | null;
};

export type ProjectStorageResolution =
  | { kind: 'organization'; connection: OrganizationStorageConnection; projectFolderId: string | null }
  | { kind: 'legacy_personal'; projectId: string; organizationId: string; projectFolderId: string | null; connectedBy: string | null }
  | { kind: 'none'; projectId: string; organizationId: string };

export const ORGANIZATION_STORAGE_LEADERS = ['business_admin', 'project_director'] as const;

const opaqueProviderId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

/** `drive.file` is intentionally insufficient to discover or validate Shared Drives. */
export function googleSharedDriveCapability(scopes: readonly string[]) {
  const canReadDriveMetadata = scopes.includes('https://www.googleapis.com/auth/drive.metadata.readonly') || scopes.includes('https://www.googleapis.com/auth/drive.readonly') || scopes.includes('https://www.googleapis.com/auth/drive');
  return {
    canDiscoverSharedDrives: canReadDriveMetadata,
    canVerifySharedDriveWrite: false,
    reason: canReadDriveMetadata
      ? 'Discovery scope is present, but write verification must be performed server-side against the selected drive.'
      : 'Current drive.file consent is limited to app-created/opened files and cannot safely enumerate Shared Drives.',
  };
}

export function classifyStorageOwnership(input: { sharedDriveId?: string | null; organizationVerified?: boolean; providerRootId?: string | null }): StorageOwnershipType | null {
  if (!input.providerRootId || !opaqueProviderId.test(input.providerRootId)) return null;
  if (input.sharedDriveId) return opaqueProviderId.test(input.sharedDriveId) ? 'SHARED_DRIVE' : null;
  return input.organizationVerified ? 'ORGANIZATION_CONTROLLED' : 'PERSONAL_DRIVE';
}

export function canManageOrganizationStorage(role: string, organizationMatches: boolean) {
  return organizationMatches && ORGANIZATION_STORAGE_LEADERS.includes(role as typeof ORGANIZATION_STORAGE_LEADERS[number]);
}

/** A storage connection never grants BuildTrack project membership or feature access. */
export async function authorizeOrganizationStorageRequest(request: Request, projectId: string) {
  const authorized = await authorizeProjectRequest(request, projectId, 'settings', 'write');
  if ('error' in authorized) return authorized;
  if (!canManageOrganizationStorage(authorized.role, Boolean(authorized.project.organizationId))) {
    return { error: 'Only organization leadership can manage organization storage.', status: 403 } as const;
  }
  return authorized;
}

/** Deterministic and server-only: organization-controlled destination first, then the same project's legacy Drive. */
export async function resolveProjectOrganizationStorage(admin: SupabaseClient, projectId: string, organizationId: string): Promise<ProjectStorageResolution> {
  const { data: connection, error: connectionError } = await admin
    .from('organization_storage_connections')
    .select('id,organization_id,provider,ownership_type,status,is_active,root_object_id,shared_drive_id,connected_by,verified_by,verified_at,provider_account_hint,encrypted_refresh_token')
    .eq('organization_id', organizationId).eq('is_active', true).eq('status', 'CONNECTED').eq('provider', 'GOOGLE_DRIVE').maybeSingle();
  if (connectionError) throw new Error(connectionError.message);
  if (connection) {
    const { data: folder, error: folderError } = await admin.from('organization_storage_project_folders')
      .select('project_folder_id').eq('organization_id', organizationId).eq('project_id', projectId).eq('connection_id', connection.id).eq('status', 'CONNECTED').maybeSingle();
    if (folderError) throw new Error(folderError.message);
    return { kind: 'organization', connection: connection as OrganizationStorageConnection, projectFolderId: folder?.project_folder_id || null };
  }
  const { data: legacy, error: legacyError } = await admin.from('google_connections')
    .select('organization_id,project_id,project_folder_id,connected_by,status').eq('project_id', projectId).eq('organization_id', organizationId).eq('status', 'connected').maybeSingle();
  if (legacyError) throw new Error(legacyError.message);
  if (legacy) return { kind: 'legacy_personal', projectId, organizationId, projectFolderId: legacy.project_folder_id || null, connectedBy: legacy.connected_by || null };
  return { kind: 'none', projectId, organizationId };
}

export function organizationStorageView(resolution: ProjectStorageResolution) {
  if (resolution.kind === 'organization') return {
    kind: resolution.kind, provider: resolution.connection.provider, ownershipType: resolution.connection.ownership_type,
    status: resolution.connection.status, projectFolderReady: Boolean(resolution.projectFolderId), verifiedAt: resolution.connection.verified_at,
  };
  if (resolution.kind === 'legacy_personal') return { kind: resolution.kind, ownershipType: 'PERSONAL_DRIVE', projectFolderReady: Boolean(resolution.projectFolderId) };
  return { kind: 'none', projectFolderReady: false };
}
