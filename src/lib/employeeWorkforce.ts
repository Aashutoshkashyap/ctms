/**
 * Organization HR records are deliberately separate from `project_users`.
 * A project assignment describes where somebody works; only project_users can
 * grant a login or a BuildTrack capability.
 */
export const EMPLOYMENT_STATUSES = ['active', 'probation', 'on_leave', 'suspended', 'separated', 'inactive'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'casual', 'consultant', 'other'] as const;
export type EmploymentStatus = typeof EMPLOYMENT_STATUSES[number];
export type EmploymentType = typeof EMPLOYMENT_TYPES[number];

export type EmployeeMasterInput = {
  organizationId: string; personId?: string | null; employeeCode: string; fullName: string;
  email?: string | null; phone?: string | null; employmentStatus: EmploymentStatus;
  employmentType?: EmploymentType | null; department?: string | null; designation?: string | null;
  joiningDate?: string | null; exitDate?: string | null; tradeSkill?: string | null;
  location?: string | null; emergencyContact?: string | null; notes?: string | null;
};

export type EmployeeProjectAssignmentInput = {
  organizationId: string; employeeId: string; projectId: string; projectRole?: string | null;
  managerPersonId?: string | null; startDate?: string | null; endDate?: string | null; status?: 'active' | 'inactive';
};

const code = (value: string) => value.trim().toUpperCase();
export function validateEmployeeMaster(input: EmployeeMasterInput): string | null {
  if (!input.organizationId || !code(input.employeeCode) || !input.fullName.trim()) return 'Employee code and full name are required.';
  if (!EMPLOYMENT_STATUSES.includes(input.employmentStatus)) return 'Employment status is invalid.';
  if (input.employmentType && !EMPLOYMENT_TYPES.includes(input.employmentType)) return 'Employment type is invalid.';
  if (input.exitDate && input.joiningDate && input.exitDate < input.joiningDate) return 'Exit date cannot be before joining date.';
  return null;
}

export function validateEmployeeAssignment(input: EmployeeProjectAssignmentInput): string | null {
  if (!input.organizationId || !input.employeeId || !input.projectId) return 'Organization, employee and project are required.';
  if (input.endDate && input.startDate && input.endDate < input.startDate) return 'Assignment end date cannot be before its start date.';
  return null;
}

/** Client-provided IDs must never be allowed to make a cross-tenant association. */
export function sameOrganization(...records: Array<{ organization_id?: string | null } | null | undefined>) {
  const ids = records.map(record => record?.organization_id).filter(Boolean);
  return ids.length > 0 && ids.every(id => id === ids[0]);
}

export function employeeCodeKey(value: string) { return code(value); }

