import { authorizeOrganizationHrRequest } from '../../../../lib/server/organizationHrAuthorization';
import { employeeCodeKey, validateEmployeeAssignment, validateEmployeeMaster, type EmployeeMasterInput, type EmployeeProjectAssignmentInput } from '../../../../lib/employeeWorkforce';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';

function text(value: unknown) { return typeof value === 'string' ? value.trim() || null : null; }
function metadata(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get('organizationId') || '';
  const actor = await authorizeOrganizationHrRequest(request, organizationId);
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const [employees, assignments, history, credentials] = await Promise.all([
    actor.admin.from('employee_records').select('*').eq('organization_id', organizationId).order('full_name'),
    actor.admin.from('employee_project_assignments').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    actor.admin.from('employee_employment_history').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(250),
    actor.admin.from('employee_credentials').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(250),
  ]);
  const error = employees.error || assignments.error || history.error || credentials.error;
  if (error) return Response.json({ error: 'Employee records could not be loaded.' }, { status: 400 });
  return Response.json({ employees: employees.data || [], assignments: assignments.data || [], history: history.data || [], credentials: credentials.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const limit = rateLimit({ key: `hr-employees:${getClientIp(request)}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.json().catch(() => null) as (Partial<EmployeeMasterInput> & { action?: 'create' | 'assign'; assignment?: Partial<EmployeeProjectAssignmentInput> }) | null;
  const organizationId = text(body?.organizationId) || '';
  const actor = await authorizeOrganizationHrRequest(request, organizationId);
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  if (body?.action === 'assign') return saveAssignment(actor, { ...body.assignment, organizationId });
  const input: EmployeeMasterInput = {
    organizationId, personId: text(body?.personId), employeeCode: text(body?.employeeCode) || '', fullName: text(body?.fullName) || '',
    email: text(body?.email), phone: text(body?.phone), employmentStatus: body?.employmentStatus as EmployeeMasterInput['employmentStatus'], employmentType: body?.employmentType as EmployeeMasterInput['employmentType'],
    department: text(body?.department), designation: text(body?.designation), joiningDate: text(body?.joiningDate), exitDate: text(body?.exitDate), tradeSkill: text(body?.tradeSkill), location: text(body?.location), emergencyContact: text(body?.emergencyContact), notes: text(body?.notes),
  };
  const invalid = validateEmployeeMaster(input);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const record = { organization_id: organizationId, person_id: input.personId, employee_code: employeeCodeKey(input.employeeCode), full_name: input.fullName, email: input.email, phone: input.phone, employment_status: input.employmentStatus, employment_type: input.employmentType, department: input.department, designation: input.designation, joining_date: input.joiningDate, exit_date: input.exitDate, trade_skill: input.tradeSkill, location: input.location, emergency_contact: input.emergencyContact, notes: input.notes, metadata: metadata((body as any).metadata), active: input.employmentStatus !== 'inactive' && input.employmentStatus !== 'separated', created_by: actor.userId };
  const { data, error } = await actor.admin.from('employee_records').insert(record).select('*').single();
  if (error || !data) return Response.json({ error: error?.code === '23505' ? 'Employee code or linked user already exists for this business.' : 'Employee record could not be saved.' }, { status: error?.code === '23505' ? 409 : 400 });
  const { error: historyError } = await actor.admin.from('employee_employment_history').insert({ organization_id: organizationId, employee_id: data.id, event_type: 'joined', effective_date: input.joiningDate, next_value: { designation: input.designation, department: input.department, employment_status: input.employmentStatus }, created_by: actor.userId });
  if (historyError) return Response.json({ error: 'Employee was saved but its employment history could not be recorded. Please retry.' }, { status: 409 });
  return Response.json({ employee: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { organizationId?: string; employeeId?: string; action?: 'update' | 'assign'; changes?: Record<string, unknown>; assignment?: Partial<EmployeeProjectAssignmentInput> } | null;
  const organizationId = text(body?.organizationId) || '';
  const actor = await authorizeOrganizationHrRequest(request, organizationId);
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  if (body?.action === 'assign') return saveAssignment(actor, { ...body.assignment, organizationId });
  if (!body?.employeeId || !body.changes) return Response.json({ error: 'Employee and changes are required.' }, { status: 400 });
  const current = await actor.admin.from('employee_records').select('*').eq('id', body.employeeId).eq('organization_id', organizationId).maybeSingle();
  if (current.error || !current.data) return Response.json({ error: 'Employee record was not found.' }, { status: 404 });
  const allowed = ['full_name','email','phone','employment_status','employment_type','department','designation','joining_date','exit_date','trade_skill','location','emergency_contact','notes','active','metadata'];
  const changes = Object.fromEntries(Object.entries(body.changes).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(changes).length) return Response.json({ error: 'No permitted employee fields were supplied.' }, { status: 400 });
  const candidate = { organizationId, personId: current.data.person_id, employeeCode: current.data.employee_code, fullName: String(changes.full_name ?? current.data.full_name), employmentStatus: (changes.employment_status ?? current.data.employment_status) as EmployeeMasterInput['employmentStatus'], employmentType: (changes.employment_type ?? current.data.employment_type) as EmployeeMasterInput['employmentType'], joiningDate: String(changes.joining_date ?? current.data.joining_date ?? '') || null, exitDate: String(changes.exit_date ?? current.data.exit_date ?? '') || null } as EmployeeMasterInput;
  const invalid = validateEmployeeMaster(candidate); if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const { data, error } = await actor.admin.from('employee_records').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', body.employeeId).eq('organization_id', organizationId).select('*').single();
  if (error || !data) return Response.json({ error: 'Employee record could not be updated.' }, { status: 400 });
  await actor.admin.from('employee_employment_history').insert({ organization_id: organizationId, employee_id: data.id, event_type: 'note', effective_date: new Date().toISOString().slice(0, 10), previous_value: current.data, next_value: changes, created_by: actor.userId });
  return Response.json({ employee: data });
}

async function saveAssignment(actor: { admin: any; userId: string; organizationId: string }, raw: Partial<EmployeeProjectAssignmentInput>) {
  const input: EmployeeProjectAssignmentInput = { organizationId: actor.organizationId, employeeId: text(raw.employeeId) || '', projectId: text(raw.projectId) || '', projectRole: text(raw.projectRole), managerPersonId: text(raw.managerPersonId), startDate: text(raw.startDate), endDate: text(raw.endDate), status: raw.status === 'inactive' ? 'inactive' : 'active' };
  const invalid = validateEmployeeAssignment(input); if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const [employee, project] = await Promise.all([
    actor.admin.from('employee_records').select('id,organization_id,person_id').eq('id', input.employeeId).eq('organization_id', actor.organizationId).maybeSingle(),
    actor.admin.from('projects').select('id,organization_id').eq('id', input.projectId).eq('organization_id', actor.organizationId).maybeSingle(),
  ]);
  if (!employee.data || !project.data) return Response.json({ error: 'Employee and project must belong to this business.' }, { status: 403 });
  let projectUserId: string | null = null;
  if (employee.data.person_id) {
    const membership = await actor.admin.from('project_users').select('id').eq('project_id', input.projectId).eq('auth_user_id', employee.data.person_id).maybeSingle();
    projectUserId = membership.data?.id || null;
  }
  const record = { organization_id: actor.organizationId, employee_id: input.employeeId, project_id: input.projectId, project_role: input.projectRole, manager_person_id: input.managerPersonId, project_user_id: projectUserId, start_date: input.startDate, end_date: input.endDate, status: input.status, created_by: actor.userId, updated_at: new Date().toISOString() };
  const { data, error } = await actor.admin.from('employee_project_assignments').upsert(record, { onConflict: 'employee_id,project_id' }).select('*').single();
  if (error || !data) return Response.json({ error: 'Project assignment could not be saved.' }, { status: 400 });
  await actor.admin.from('employee_employment_history').insert({ organization_id: actor.organizationId, employee_id: input.employeeId, event_type: 'project_transfer', effective_date: input.startDate, next_value: { project_id: input.projectId, project_role: input.projectRole, manager_person_id: input.managerPersonId, status: input.status }, created_by: actor.userId });
  return Response.json({ assignment: data, grantsAccess: false });
}
