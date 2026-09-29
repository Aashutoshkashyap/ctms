import type { Feature, FeaturePermissions } from './permissions';

export type AssignmentStatus = 'scheduled' | 'active' | 'expired';
export type DepartmentKey = 'site' | 'procurement' | 'stores' | 'finance' | 'hr' | 'equipment' | 'commercial' | 'documents' | 'qaqc' | 'safety';
export type ProjectAssignment = { id: string; project_id: string; person_id: string; department_key: DepartmentKey | null; project_role: string; feature_access: FeaturePermissions; start_date: string; end_date: string | null; reports_to_person_id: string | null; created_at?: string };

// These are organizational contexts only. They never grant application access;
// the established project membership and authorization boundary remain decisive.
export const DEPARTMENTS: Array<{ id: DepartmentKey; name: string }> = [
  { id: 'site', name: 'Project / Site' }, { id: 'procurement', name: 'Procurement' },
  { id: 'stores', name: 'Stores / Warehouse' }, { id: 'finance', name: 'Finance' },
  { id: 'hr', name: 'HR / People' }, { id: 'equipment', name: 'Equipment' },
  { id: 'commercial', name: 'Commercial / QS' }, { id: 'documents', name: 'Documents / Administration' },
  { id: 'qaqc', name: 'QA / QC' }, { id: 'safety', name: 'Safety' },
];

export function departmentName(key: string | null | undefined) {
  return DEPARTMENTS.find((department) => department.id === key)?.name || 'Not assigned';
}

export function validDepartmentKey(value: unknown): value is DepartmentKey | null {
  return value === null || value === '' || (typeof value === 'string' && DEPARTMENTS.some((department) => department.id === value));
}

export const PROJECT_ROLE_SUGGESTIONS: Record<string, Feature[]> = {
  'Project Manager': ['executive', 'daily_reports', 'schedule', 'budget', 'procurement', 'ipc', 'documents', 'reports'],
  'Site Engineer': ['executive', 'daily_reports', 'schedule', 'employee_tracking', 'documents', 'upload_evidence'],
  'Site Supervisor': ['executive', 'daily_reports', 'upload_evidence'],
  'QS / Billing Engineer': ['schedule', 'budget', 'ipc', 'claims', 'reports'],
  'Procurement Officer': ['procurement', 'obligations', 'documents'],
  'Store Officer': ['procurement', 'operations', 'expenses'],
  'Accountant': ['budget', 'ipc', 'reports', 'expenses'],
  'HR Officer': ['employee_tracking'],
  'Safety Officer': ['daily_reports', 'documents', 'upload_evidence'],
};

export const PROJECT_ROLE_OPTIONS = ['Project Manager', 'Site Engineer', 'Site Supervisor', 'QS / Billing Engineer', 'Safety Officer', 'QA/QC Engineer', 'Procurement Officer', 'Store Officer', 'Accountant', 'HR Officer', 'Equipment Officer', 'Document Controller', 'Vendor/Contractor Coordinator'];

export const FEATURE_GROUPS: Array<{ title: string; features: Array<[Feature, string]> }> = [
  { title: 'Project', features: [['executive', 'Project Dashboard'], ['daily_reports', 'Daily Reports'], ['schedule', 'BOQ & milestones']] },
  { title: 'Commercial', features: [['budget', 'Cost Control'], ['ipc', 'IPC Valuation & Payment Certificates'], ['claims', 'Variations / Claims / EOT']] },
  { title: 'Procurement & stores', features: [['procurement', 'Procurement & Stores'], ['obligations', 'Purchase orders & vendors'], ['operations', 'Equipment']] },
  { title: 'People', features: [['employee_tracking', 'Workforce'], ['expenses', 'Leave & payroll records']] },
  { title: 'Documents & evidence', features: [['documents', 'Documents'], ['view_evidence', 'Evidence / photos']] },
  { title: 'Reporting', features: [['reports', 'Reports']] },
];

export function assignmentStatus(assignment: Pick<ProjectAssignment, 'start_date' | 'end_date'>, today = new Date().toISOString().slice(0, 10)): AssignmentStatus {
  if (assignment.start_date > today) return 'scheduled';
  if (assignment.end_date && assignment.end_date < today) return 'expired';
  return 'active';
}

export function suggestedFeatureAccess(projectRole: string): FeaturePermissions {
  return Object.fromEntries((PROJECT_ROLE_SUGGESTIONS[projectRole] || []).map(feature => [feature, 'write'])) as FeaturePermissions;
}
