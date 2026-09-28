import { authorizeProjectRequest } from '../../../lib/server/projectAuthorization';
import { PROJECT_ROLE_OPTIONS } from '../../../lib/projectAssignments';
import type { FeaturePermissions } from '../../../lib/permissions';

const validPermission = new Set(['read', 'write']);
function safeFeatures(input: unknown): FeaturePermissions {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([, value]) => validPermission.has(String(value)))) as FeaturePermissions;
}
function validDate(value: unknown) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }

async function authorize(request: Request, projectId: string, access: 'read' | 'write') {
  return authorizeProjectRequest(request, projectId, 'manage_users', access);
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const auth = await authorize(request, projectId, 'read');
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const [{ data: assignments, error }, { data: people }] = await Promise.all([
    auth.admin.from('project_person_assignments').select('id,project_id,person_id,project_role,feature_access,start_date,end_date,reports_to_person_id,created_at').eq('project_id', projectId).order('start_date', { ascending: false }),
    auth.admin.from('project_users').select('auth_user_id,name,email,role').eq('project_id', projectId).order('name'),
  ]);
  if (error) return Response.json({ error: 'Assignments could not be loaded.' }, { status: 400 });
  return Response.json({ assignments: assignments || [], people: people || [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = String(body?.projectId || ''); const auth = await authorize(request, projectId, 'write');
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const personId = String(body?.personId || ''); const projectRole = String(body?.projectRole || ''); const startDate = body?.startDate; const endDate = body?.endDate;
  if (!personId || !PROJECT_ROLE_OPTIONS.includes(projectRole) || !validDate(startDate) || (endDate && !validDate(endDate)) || (endDate && String(endDate) < String(startDate))) return Response.json({ error: 'Choose a person, project role and valid access period.' }, { status: 400 });
  const [{ data: person }, { data: manager }] = await Promise.all([
    auth.admin.from('project_users').select('auth_user_id').eq('project_id', projectId).eq('auth_user_id', personId).maybeSingle(),
    body?.reportsToPersonId ? auth.admin.from('project_users').select('auth_user_id').eq('project_id', projectId).eq('auth_user_id', String(body.reportsToPersonId)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!person || (body?.reportsToPersonId && !manager) || String(body?.reportsToPersonId || '') === personId) return Response.json({ error: 'The person and Reports To contact must already belong to this project.' }, { status: 400 });
  const { data, error } = await auth.admin.from('project_person_assignments').upsert({ organization_id: auth.project.organizationId, project_id: projectId, person_id: personId, project_role: projectRole, feature_access: safeFeatures(body?.featureAccess), start_date: startDate, end_date: endDate || null, reports_to_person_id: body?.reportsToPersonId || null, created_by: auth.userId }, { onConflict: 'project_id,person_id' }).select('id,project_id,person_id,project_role,feature_access,start_date,end_date,reports_to_person_id,created_at').single();
  if (error) return Response.json({ error: 'Assignment could not be saved.' }, { status: 400 });
  return Response.json({ assignment: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = String(body?.projectId || ''); const assignmentId = String(body?.assignmentId || ''); const auth = await authorize(request, projectId, 'write');
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  if (!assignmentId) return Response.json({ error: 'Assignment is required.' }, { status: 400 });
  const update = body?.endAssignment ? { end_date: new Date().toISOString().slice(0, 10) } : { project_role: String(body?.projectRole || ''), feature_access: safeFeatures(body?.featureAccess), start_date: body?.startDate, end_date: body?.endDate || null, reports_to_person_id: body?.reportsToPersonId || null };
  if (!body?.endAssignment && (!PROJECT_ROLE_OPTIONS.includes(String(update.project_role)) || !validDate(update.start_date) || (update.end_date && (!validDate(update.end_date) || String(update.end_date) < String(update.start_date))))) return Response.json({ error: 'Use a valid project role and access period.' }, { status: 400 });
  const { data, error } = await auth.admin.from('project_person_assignments').update(update).eq('id', assignmentId).eq('project_id', projectId).select('id,project_id,person_id,project_role,feature_access,start_date,end_date,reports_to_person_id,created_at').single();
  if (error || !data) return Response.json({ error: 'Assignment could not be changed.' }, { status: 400 });
  return Response.json({ assignment: data });
}
