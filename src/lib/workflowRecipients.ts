export type WorkflowAssignment = { person_id: string; project_role: string; start_date: string; end_date: string | null };

const departmentRoles: Record<string, string[]> = {
  procurement: ['Procurement Officer', 'Store Officer', 'Vendor/Contractor Coordinator'],
  finance: ['Accountant', 'QS / Billing Engineer'],
  commercial: ['QS / Billing Engineer', 'Vendor/Contractor Coordinator'],
  people: ['HR Officer', 'Project Manager'],
  site: ['Project Manager', 'Site Engineer', 'Site Supervisor'],
  safety: ['Safety Officer', 'QA/QC Engineer'],
  documents: ['Document Controller'],
};

export function activeAssignmentPeople(assignments: WorkflowAssignment[], departmentKey?: string, today = new Date().toISOString().slice(0, 10)) {
  const allowedRoles = departmentKey ? departmentRoles[departmentKey.toLowerCase()] : undefined;
  return [...new Set(assignments.filter((assignment) => assignment.start_date <= today && (!assignment.end_date || assignment.end_date >= today) && (!allowedRoles || allowedRoles.includes(assignment.project_role))).map((assignment) => assignment.person_id))];
}
