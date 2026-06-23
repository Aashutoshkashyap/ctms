export const PROJECT_ROLES = [
  'super_admin',
  'project_director',
  'project_manager',
  'planning_engineer',
  'site_engineer',
  'qs_billing_engineer',
  'design_coordinator',
  'qa_qc_engineer',
  'safety_officer',
  'store_officer',
  'accountant',
  'subcontractor',
  'jv_partner',
  'employer_viewer',
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

export type Feature =
  | 'executive'
  | 'schedule'
  | 'forecast'
  | 'daily_reports'
  | 'operations'
  | 'employee_tracking'
  | 'design'
  | 'budget'
  | 'ipc'
  | 'claims'
  | 'procurement'
  | 'obligations'
  | 'qaqc'
  | 'safety'
  | 'finance'
  | 'expenses'
  | 'documents'
  | 'reports'
  | 'handover'
  | 'defects'
  | 'ai'
  | 'settings'
  | 'manage_users'
  | 'manage_projects'
  | 'upload_evidence'
  | 'view_evidence'
  | 'approve_expenses';

const allFeatures: Feature[] = [
  'executive', 'schedule', 'forecast', 'daily_reports', 'operations', 'employee_tracking',
  'design', 'budget', 'ipc', 'claims', 'procurement', 'obligations', 'qaqc', 'safety',
  'finance', 'expenses', 'documents', 'reports', 'handover', 'defects', 'ai', 'settings',
  'manage_users', 'manage_projects', 'upload_evidence', 'view_evidence', 'approve_expenses',
];

export const ROLE_PERMISSIONS: Record<ProjectRole, Feature[]> = {
  project_director: allFeatures,
  super_admin: ['documents', 'procurement', 'obligations', 'settings', 'manage_users', 'manage_projects'],
  project_manager: [
    'schedule', 'forecast', 'daily_reports', 'operations', 'employee_tracking', 'design',
    'budget', 'ipc', 'claims', 'procurement', 'obligations', 'qaqc', 'safety', 'expenses',
    'documents', 'reports', 'handover', 'defects', 'ai', 'upload_evidence',
  ],
  planning_engineer: ['schedule', 'forecast', 'daily_reports', 'operations', 'reports', 'ai'],
  site_engineer: ['schedule', 'daily_reports', 'operations', 'employee_tracking', 'qaqc', 'safety', 'upload_evidence'],
  qs_billing_engineer: ['budget', 'ipc', 'claims', 'finance', 'expenses', 'documents', 'reports', 'approve_expenses'],
  design_coordinator: ['schedule', 'design', 'documents', 'daily_reports', 'upload_evidence'],
  qa_qc_engineer: ['daily_reports', 'operations', 'qaqc', 'documents', 'handover', 'defects', 'upload_evidence'],
  safety_officer: ['daily_reports', 'operations', 'employee_tracking', 'safety', 'documents', 'upload_evidence'],
  store_officer: ['operations', 'procurement', 'expenses', 'documents'],
  accountant: ['budget', 'ipc', 'finance', 'expenses', 'reports', 'approve_expenses'],
  subcontractor: ['schedule', 'daily_reports', 'operations', 'upload_evidence'],
  jv_partner: ['executive', 'schedule', 'forecast', 'reports'],
  employer_viewer: ['executive', 'schedule', 'forecast', 'reports', 'handover'],
};

export function normalizeRole(role: string): ProjectRole {
  return PROJECT_ROLES.includes(role as ProjectRole) ? role as ProjectRole : 'employer_viewer';
}

export function can(role: string, feature: Feature): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(feature);
}

export const ROLE_LABELS: Record<ProjectRole, string> = {
  super_admin: 'Project Administrator',
  project_director: 'Project Director',
  project_manager: 'Project Manager',
  planning_engineer: 'Planning Engineer',
  site_engineer: 'Site Engineer',
  qs_billing_engineer: 'QS / Billing Engineer',
  design_coordinator: 'Design Coordinator',
  qa_qc_engineer: 'QA / QC Engineer',
  safety_officer: 'Safety Officer',
  store_officer: 'Store Officer',
  accountant: 'Accountant',
  subcontractor: 'Subcontractor',
  jv_partner: 'JV Partner',
  employer_viewer: 'Employer / Client Viewer',
};

export const ROLE_HOME_COPY: Record<ProjectRole, { title: string; subtitle: string }> = {
  project_director: { title: 'Director Command Centre', subtitle: 'Complete project, finance, schedule, workforce, risk and evidence oversight.' },
  super_admin: { title: 'Project Administration', subtitle: 'Manage users, project setup, document controls and administrative records.' },
  project_manager: { title: 'Project Delivery Dashboard', subtitle: 'Coordinate programme, site delivery, cost controls, quality and contractual actions.' },
  planning_engineer: { title: 'Planning & Progress Dashboard', subtitle: 'Maintain WBS logic, update progress, identify delays and prepare look-ahead plans.' },
  site_engineer: { title: 'Site Execution Dashboard', subtitle: 'Record work completed, manpower, equipment, fuel, delays and site evidence.' },
  qs_billing_engineer: { title: 'Commercial Dashboard', subtitle: 'Control budgets, daily costs, valuations, claims and payment records.' },
  design_coordinator: { title: 'Design Control Dashboard', subtitle: 'Track design submissions, approvals, interfaces and construction constraints.' },
  qa_qc_engineer: { title: 'Quality Dashboard', subtitle: 'Manage inspections, test evidence, NCRs, defects and handover readiness.' },
  safety_officer: { title: 'Safety & Workforce Dashboard', subtitle: 'Track site attendance, visits, permits, observations and daily safety performance.' },
  store_officer: { title: 'Stores & Plant Dashboard', subtitle: 'Control receipts, issues, equipment deployment, fuel and stock availability.' },
  accountant: { title: 'Project Accounts Dashboard', subtitle: 'Maintain daily expense records, approvals, cash usage and accumulated cost reporting.' },
  subcontractor: { title: 'Subcontractor Workbench', subtitle: 'Submit daily quantities, resources, constraints and verification evidence.' },
  jv_partner: { title: 'JV Oversight Dashboard', subtitle: 'Read-only progress, commercial and programme visibility for JV governance.' },
  employer_viewer: { title: 'Employer Progress View', subtitle: 'Read-only project status, schedule, forecasts, reporting and handover visibility.' },
};
