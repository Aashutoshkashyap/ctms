import { authorizeOrganizationHrRequest } from '../../../../lib/server/organizationHrAuthorization';
import { evaluateEmployeeAvailability, inclusiveDays, validateAllocation, validateLeave, type LeaveLifecycle } from '../../../../lib/workforceAvailability';
import { getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/server/security';

export const dynamic = 'force-dynamic';
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams; const organizationId = params.get('organizationId') || ''; const date = params.get('date') || new Date().toISOString().slice(0, 10);
  const actor = await authorizeOrganizationHrRequest(request, organizationId);
  if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const [employees, assignments, leaves, allocations] = await Promise.all([
    actor.admin.from('employee_records').select('id,employee_code,full_name,designation,department,employment_status,active,location').eq('organization_id', organizationId).order('full_name'),
    actor.admin.from('employee_project_assignments').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }),
    actor.admin.from('employee_leave_records').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(250),
    actor.admin.from('employee_resource_allocations').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(250),
  ]);
  const error = employees.error || assignments.error || leaves.error || allocations.error;
  if (error) return Response.json({ error: 'Workforce records could not be loaded.' }, { status: 400 });
  const availability = (employees.data || []).map(employee => ({ employee_id: employee.id, by_project: (assignments.data || []).filter(a => a.employee_id === employee.id && a.status === 'active').map(a => ({ project_id: a.project_id, ...evaluateEmployeeAvailability(employee, a.project_id, date, assignments.data || [], leaves.data || [], allocations.data || []) })) }));
  return Response.json({ employees: employees.data || [], assignments: assignments.data || [], leaves: leaves.data || [], allocations: allocations.data || [], availability, date }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const limit = rateLimit({ key: `hr-workforce:${getClientIp(request)}`, limit: 20, windowMs: 60_000 }); if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const organizationId = string(body?.organizationId);
  const actor = await authorizeOrganizationHrRequest(request, organizationId); if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  if (body?.action === 'create_leave') return createLeave(actor, body);
  if (body?.action === 'create_allocation') return createAllocation(actor, body);
  return Response.json({ error: 'Unsupported workforce action.' }, { status: 400 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null; const organizationId = string(body?.organizationId);
  const actor = await authorizeOrganizationHrRequest(request, organizationId); if ('error' in actor) return Response.json({ error: actor.error }, { status: actor.status });
  const leaveId = string(body?.leaveId); const action = string(body?.action);
  if (!leaveId || !['submit','approve','reject','cancel'].includes(action)) return Response.json({ error: 'Leave record and valid action are required.' }, { status: 400 });
  const leave = await actor.admin.from('employee_leave_records').select('*').eq('id', leaveId).eq('organization_id', organizationId).maybeSingle();
  if (!leave.data) return Response.json({ error: 'Leave record was not found.' }, { status: 404 });
  if (action === 'approve' || action === 'reject') {
    const employee = await actor.admin.from('employee_records').select('person_id').eq('id', leave.data.employee_id).eq('organization_id', organizationId).maybeSingle();
    if (employee.data?.person_id === actor.userId || leave.data.submitted_by === actor.userId) return Response.json({ error: 'An employee cannot approve or reject their own leave.' }, { status: 403 });
  }
  const transitions: Record<string, LeaveLifecycle> = { submit: 'submitted', approve: 'approved', reject: 'rejected', cancel: 'cancelled' };
  const status = transitions[action];
  const permitted = action === 'submit' ? leave.data.status === 'draft' : action === 'cancel' ? ['draft','submitted','approved'].includes(leave.data.status) : leave.data.status === 'submitted';
  if (!permitted) return Response.json({ error: 'This leave action is not valid for the current status.' }, { status: 409 });
  const now = new Date().toISOString(); const patch: Record<string, unknown> = { status, updated_at: now };
  if (action === 'approve' || action === 'reject') { patch.reviewed_by = actor.userId; patch.reviewed_at = now; patch.review_notes = string(body?.reviewNotes) || null; }
  if (action === 'cancel') { patch.cancelled_by = actor.userId; patch.cancelled_at = now; }
  const updated = await actor.admin.from('employee_leave_records').update(patch).eq('id', leaveId).eq('organization_id', organizationId).eq('status', leave.data.status).select('*').single();
  if (updated.error || !updated.data) return Response.json({ error: 'Leave status changed elsewhere. Refresh and retry.' }, { status: 409 });
  return Response.json({ leave: updated.data });
}

async function createLeave(actor: { admin: any; userId: string; organizationId: string }, body: Record<string, unknown>) {
  const employeeId = string(body.employeeId); const startDate = string(body.startDate); const endDate = string(body.endDate); const leaveType = string(body.leaveType);
  const invalid = validateLeave({ employeeId, startDate, endDate, leaveType }); if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const employee = await actor.admin.from('employee_records').select('id').eq('id', employeeId).eq('organization_id', actor.organizationId).maybeSingle(); if (!employee.data) return Response.json({ error: 'Employee does not belong to this business.' }, { status: 403 });
  const projectId = string(body.projectId) || null;
  const saved = await actor.admin.from('employee_leave_records').insert({ organization_id: actor.organizationId, employee_id: employeeId, project_id: projectId, leave_type: leaveType, start_date: startDate, end_date: endDate, number_of_days: inclusiveDays(startDate, endDate), reason: string(body.reason) || null, status: 'draft', submitted_by: actor.userId }).select('*').single();
  if (saved.error || !saved.data) return Response.json({ error: 'Leave was not saved.' }, { status: 400 }); return Response.json({ leave: saved.data }, { status: 201 });
}
async function createAllocation(actor: { admin: any; userId: string; organizationId: string }, body: Record<string, unknown>) {
  const employeeId = string(body.employeeId); const projectId = string(body.projectId); const startDate = string(body.startDate); const endDate = string(body.endDate);
  const invalid = validateAllocation({ employeeId, projectId, startDate, endDate }); if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const saved = await actor.admin.from('employee_resource_allocations').insert({ organization_id: actor.organizationId, employee_id: employeeId, project_id: projectId, activity_id: string(body.activityId) || null, start_date: startDate, end_date: endDate, planned_role: string(body.plannedRole) || null, work_function: string(body.workFunction) || null, planned_quantity: Number(body.plannedQuantity) > 0 ? Number(body.plannedQuantity) : 1, status: 'planned', notes: string(body.notes) || null, created_by: actor.userId }).select('*').single();
  if (saved.error || !saved.data) return Response.json({ error: 'Allocation was not saved. Confirm the employee has an active project assignment.' }, { status: 400 }); return Response.json({ allocation: saved.data, grantsAccess: false }, { status: 201 });
}
