import { authorizeProjectRequest } from '../../../lib/server/projectAuthorization';
import { PROJECT_ROLE_OPTIONS, validDepartmentKey } from '../../../lib/projectAssignments';
import { can, type Feature, type FeaturePermissions } from '../../../lib/permissions';

const validPermission = new Set(['read', 'write']);
const validFeatures = new Set<Feature>(['executive', 'schedule', 'forecast', 'daily_reports', 'operations', 'employee_tracking', 'design', 'budget', 'ipc', 'claims', 'procurement', 'obligations', 'qaqc', 'safety', 'finance', 'expenses', 'documents', 'reports', 'handover', 'defects', 'subscription', 'ai', 'settings', 'manage_users', 'manage_projects', 'upload_evidence', 'view_evidence', 'approve_expenses']);

// Assignment capability selections are an operational responsibility view.
// They can only be a subset of the person's already-authorized project access.
function safeFeatures(input: unknown, role: string, permissions: FeaturePermissions): FeaturePermissions | null {
  if (!input || typeof input !== 'object') return {};
  const values = Object.entries(input as Record<string, unknown>);
  if (values.some(([feature, value]) => !validFeatures.has(feature as Feature) || !validPermission.has(String(value)) || !can(role, feature as Feature, permissions, 'read'))) return null;
  return Object.fromEntries(values) as FeaturePermissions;
}
function validDate(value: unknown) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }

async function authorize(request: Request, projectId: string, access: 'read' | 'write') {
  return authorizeProjectRequest(request, projectId, 'manage_users', access);
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId') || '';
  const auth = await authorize(request, projectId, 'read');
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const [{ data: assignments, error }, { data: people }, { data: procurementWork, error: workError }] = await Promise.all([
    auth.admin.from('project_person_assignments').select('id,project_id,person_id,department_key,project_role,feature_access,start_date,end_date,reports_to_person_id,created_at').eq('project_id', projectId).order('start_date', { ascending: false }),
    auth.admin.from('project_users').select('auth_user_id,name,email,role,feature_permissions').eq('project_id', projectId).order('name'),
    auth.admin.from('procurement_orders').select('id,po_number,item,status,required_date,expected_date,responsible_person_id').eq('project_id', projectId).not('responsible_person_id', 'is', null).order('required_date'),
  ]);
  if (error || workError) return Response.json({ error: 'Assignments could not be loaded.' }, { status: 400 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const activePersonIds = new Set((assignments || []).filter((assignment) => assignment.start_date <= today && (!assignment.end_date || assignment.end_date >= today)).map((assignment) => assignment.person_id));
  return Response.json({ assignments: assignments || [], people: people || [], activePeople: (people || []).filter((person) => activePersonIds.has(person.auth_user_id)), work: procurementWork || [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = String(body?.projectId || ''); const auth = await authorize(request, projectId, 'write');
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const personId = String(body?.personId || ''); const projectRole = String(body?.projectRole || ''); const departmentKey = body?.departmentKey ?? null; const startDate = body?.startDate; const endDate = body?.endDate;
  if (!personId || !PROJECT_ROLE_OPTIONS.includes(projectRole) || !validDepartmentKey(departmentKey) || !validDate(startDate) || (endDate && !validDate(endDate)) || (endDate && String(endDate) < String(startDate))) return Response.json({ error: 'Choose a person, department, project role and valid access period.' }, { status: 400 });
  const [{ data: person }, { data: manager }] = await Promise.all([
    auth.admin.from('project_users').select('auth_user_id,role,feature_permissions').eq('project_id', projectId).eq('auth_user_id', personId).maybeSingle(),
    body?.reportsToPersonId ? auth.admin.from('project_users').select('auth_user_id').eq('project_id', projectId).eq('auth_user_id', String(body.reportsToPersonId)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!person || (body?.reportsToPersonId && !manager) || String(body?.reportsToPersonId || '') === personId) return Response.json({ error: 'The person and Reports To contact must already belong to this project.' }, { status: 400 });
  const featureAccess = safeFeatures(body?.featureAccess, person.role, person.feature_permissions || {});
  if (!featureAccess) return Response.json({ error: 'Assignment capabilities must be within the person’s existing project access.' }, { status: 403 });
  const { data, error } = await auth.admin.from('project_person_assignments').upsert({ organization_id: auth.project.organizationId, project_id: projectId, person_id: personId, department_key: departmentKey || null, project_role: projectRole, feature_access: featureAccess, start_date: startDate, end_date: endDate || null, reports_to_person_id: body?.reportsToPersonId || null, created_by: auth.userId }, { onConflict: 'project_id,person_id' }).select('id,project_id,person_id,department_key,project_role,feature_access,start_date,end_date,reports_to_person_id,created_at').single();
  if (error) return Response.json({ error: 'Assignment could not be saved.' }, { status: 400 });
  return Response.json({ assignment: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = String(body?.projectId || ''); const assignmentId = String(body?.assignmentId || ''); const auth = await authorize(request, projectId, 'write');
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
  if (!assignmentId) return Response.json({ error: 'Assignment is required.' }, { status: 400 });
  const current = await auth.admin.from('project_person_assignments').select('person_id').eq('id', assignmentId).eq('project_id', projectId).maybeSingle();
  if (!current.data) return Response.json({ error: 'Assignment could not be found in this project.' }, { status: 404 });
  const person = await auth.admin.from('project_users').select('role,feature_permissions').eq('project_id', projectId).eq('auth_user_id', current.data.person_id).maybeSingle();
  if (!person.data) return Response.json({ error: 'The assigned person no longer belongs to this project.' }, { status: 400 });
  const featureAccess = body?.endAssignment ? {} : safeFeatures(body?.featureAccess, person.data.role, person.data.feature_permissions || {});
  const update = body?.endAssignment ? { end_date: new Date().toISOString().slice(0, 10) } : { department_key: body?.departmentKey || null, project_role: String(body?.projectRole || ''), feature_access: featureAccess, start_date: body?.startDate, end_date: body?.endDate || null, reports_to_person_id: body?.reportsToPersonId || null };
  if (!body?.endAssignment && (!featureAccess || !validDepartmentKey(body?.departmentKey ?? null) || !PROJECT_ROLE_OPTIONS.includes(String(update.project_role)) || !validDate(update.start_date) || (update.end_date && (!validDate(update.end_date) || String(update.end_date) < String(update.start_date))))) return Response.json({ error: 'Use an authorized capability set, department, project role and access period.' }, { status: 400 });
  const { data, error } = await auth.admin.from('project_person_assignments').update(update).eq('id', assignmentId).eq('project_id', projectId).select('id,project_id,person_id,department_key,project_role,feature_access,start_date,end_date,reports_to_person_id,created_at').single();
  if (error || !data) return Response.json({ error: 'Assignment could not be changed.' }, { status: 400 });
  return Response.json({ assignment: data });
}
