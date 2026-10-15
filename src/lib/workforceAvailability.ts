export type LeaveLifecycle = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
export type WorkforceAvailability = { available: boolean; reasons: Array<'inactive' | 'outside_assignment' | 'approved_leave' | 'allocated_elsewhere'> };

type Employee = { id: string; active: boolean; employment_status: string };
type Assignment = { employee_id: string; project_id: string; status: string; start_date?: string | null; end_date?: string | null };
type Leave = { employee_id: string; project_id?: string | null; status: LeaveLifecycle; start_date: string; end_date: string };
type Allocation = { employee_id: string; project_id: string; status: 'planned' | 'active' | 'cancelled' | 'completed'; start_date: string; end_date: string };

export function dateOverlaps(start: string, end: string, day: string) { return Boolean(start && end && day && start <= day && day <= end); }

/** Operational availability, not attendance. Daily reports remain the source of site activity. */
export function evaluateEmployeeAvailability(employee: Employee, projectId: string, day: string, assignments: Assignment[], leaves: Leave[], allocations: Allocation[]): WorkforceAvailability {
  const reasons: WorkforceAvailability['reasons'] = [];
  if (!employee.active || ['inactive', 'separated', 'suspended'].includes(employee.employment_status)) reasons.push('inactive');
  const assigned = assignments.some(item => item.employee_id === employee.id && item.project_id === projectId && item.status === 'active' && (!item.start_date || item.start_date <= day) && (!item.end_date || item.end_date >= day));
  if (!assigned) reasons.push('outside_assignment');
  if (leaves.some(item => item.employee_id === employee.id && item.status === 'approved' && dateOverlaps(item.start_date, item.end_date, day))) reasons.push('approved_leave');
  if (allocations.some(item => item.employee_id === employee.id && item.project_id !== projectId && ['planned','active'].includes(item.status) && dateOverlaps(item.start_date, item.end_date, day))) reasons.push('allocated_elsewhere');
  return { available: reasons.length === 0, reasons };
}

export function validateLeave(input: { employeeId?: string; startDate?: string; endDate?: string; leaveType?: string }) {
  if (!input.employeeId || !input.leaveType?.trim() || !input.startDate || !input.endDate) return 'Employee, leave type, start date and end date are required.';
  if (input.endDate < input.startDate) return 'Leave end date cannot be before start date.';
  return null;
}
export function inclusiveDays(start: string, end: string) { return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1; }
export function validateAllocation(input: { employeeId?: string; projectId?: string; startDate?: string; endDate?: string }) {
  if (!input.employeeId || !input.projectId || !input.startDate || !input.endDate) return 'Employee, project and allocation dates are required.';
  if (input.endDate < input.startDate) return 'Allocation end date cannot be before start date.';
  return null;
}

/** Intentionally narrow future-payroll input contract; it performs no payroll calculation. */
export type PayrollWorkforceInput = { employeeId: string; projectId: string; date: string; approvedLeave: boolean; plannedAllocation: boolean; dailyResourceRecordIds: string[] };
