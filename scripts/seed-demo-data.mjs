import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const organizationId = 'org-buildtrack-demo';

const people = [
  ['admin@buildtrack.com', 'Arjun Adhikari', 'super_admin'],
  ['businessadmin@buildtrack.com', 'Nisha Karki', 'business_admin'],
  ['director@buildtrack.com', 'Dr. Ramesh Thapa', 'project_director'],
  ['pm@buildtrack.com', 'Eng. Santosh Yadav', 'project_manager'],
  ['planning@buildtrack.com', 'Sujita Shrestha', 'planning_engineer'],
  ['site@buildtrack.com', 'Binod Tamang', 'site_engineer'],
  ['employee@buildtrack.com', 'Maya Rai', 'field_employee'],
  ['qs@buildtrack.com', 'Gopal Bhatta', 'qs_billing_engineer'],
  ['accountant@buildtrack.com', 'Sarita Poudel', 'accountant'],
  ['store@buildtrack.com', 'Raju Gurung', 'store_officer'],
  ['design@buildtrack.com', 'Sunita Pradhan', 'design_coordinator'],
  ['qaqc@buildtrack.com', 'Kiran KC', 'qa_qc_engineer'],
  ['safety@buildtrack.com', 'Prem Chaudhary', 'safety_officer'],
  ['employer@buildtrack.com', 'Govind Raj Pandey', 'employer_viewer'],
];

const projects = [
  { id: 'proj-101', name: 'Kathmandu-Terai Fast Track - Section 3 (D&B)', contract_number: 'EE-DB-03/080-81', contract_amount: 250000000, start_date: '2025-01-01', contract_duration_days: 900, target_completion_date: '2027-06-19', lead_partner: 'Mero Construction Pvt. Ltd.' },
  { id: 'proj-demo-airport', name: 'Pokhara Airport Terminal Expansion (D&B)', contract_number: 'CAAN/DB/TERMINAL-02', contract_amount: 185000000, start_date: '2025-09-01', contract_duration_days: 640, target_completion_date: '2027-06-03', lead_partner: 'Mero Construction Pvt. Ltd.' },
  { id: 'proj-demo-water', name: 'Melamchi Water Treatment Plant Upgrade (D&B)', contract_number: 'KUKL/WTP/DB-07', contract_amount: 320000000, start_date: '2025-04-15', contract_duration_days: 820, target_completion_date: '2027-07-14', lead_partner: 'Mero Construction Pvt. Ltd.' },
  { id: 'proj-demo-hospital', name: 'Biratnagar Provincial Hospital Block (D&B)', contract_number: 'MOHP/DB/HOSP-11', contract_amount: 145000000, start_date: '2025-11-10', contract_duration_days: 540, target_completion_date: '2027-05-04', lead_partner: 'Mero Construction Pvt. Ltd.' },
];

async function upsert(table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

const { data: listed, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (usersError) throw usersError;
const authByEmail = new Map(listed.users.map(user => [user.email?.toLowerCase(), user]));
const missing = people.filter(([email]) => !authByEmail.has(email));
if (missing.length) throw new Error(`Create these demo Auth users first: ${missing.map(([email]) => email).join(', ')}`);

const director = authByEmail.get('director@buildtrack.com');
const platformAdmin = authByEmail.get('admin@buildtrack.com');
const businessAdmin = authByEmail.get('businessadmin@buildtrack.com');

await upsert('organizations', [{
  id: organizationId,
  name: 'BuildTrack Demo Construction Group',
  contact_email: 'director@buildtrack.com',
  plan: 'enterprise_trial',
  subscription_status: 'trial',
  access_until: '2026-08-11',
  seat_limit: 100,
  project_limit: 20,
  created_by: director.id,
  updated_at: new Date().toISOString(),
}]);

await upsert('platform_admins', [{ auth_user_id: platformAdmin.id, email: platformAdmin.email, name: 'Arjun Adhikari' }], 'auth_user_id');
await upsert('organization_members', [
  { id: `${organizationId}-${director.id}`, organization_id: organizationId, auth_user_id: director.id, email: director.email, name: 'Dr. Ramesh Thapa', role: 'project_director', status: 'active' },
  { id: `${organizationId}-${businessAdmin.id}`, organization_id: organizationId, auth_user_id: businessAdmin.id, email: businessAdmin.email, name: 'Nisha Karki', role: 'business_admin', status: 'active' },
], 'organization_id,auth_user_id');

await upsert('projects', projects.map(project => ({
  ...project,
  created_by: director.id,
  organization_id: organizationId,
  organization_name: 'BuildTrack Demo Construction Group',
  currency: 'NPR',
  jv_status: 'solo',
  other_partners: [],
  status: 'active',
  access_until: '2026-08-11',
})));

const projectMembers = projects.flatMap(project => people
  .filter(([, , role]) => role !== 'super_admin')
  .map(([email, name, role]) => {
    const user = authByEmail.get(email);
    return { id: `${project.id}-${user.id}`, auth_user_id: user.id, project_id: project.id, email, name, role };
  }));
await upsert('project_users', projectMembers, 'project_id,email');

const wbs = [];
const activities = [];
const reports = [];
const workItems = [];
const expenses = [];
const resources = [];
const visits = [];
const employees = [];
const purchaseOrders = [];
const storeItems = [];
const inventoryEvents = [];
const obligations = [];
const notifications = [];
const financeRows = [];
const ipcs = [];
const ipcPayments = [];
const documents = [];

projects.forEach((project, projectIndex) => {
  const prefix = project.id.replaceAll('proj-', '').replaceAll('-', '_');
  const progress = [48, 31, 39, 24][projectIndex];
  const costs = [18400000, 925000, 1287000, 696000][projectIndex];
  wbs.push(
    { id: `${prefix}-wbs-01`, project_id: project.id, wbs_code: '01', name: 'Design and Approvals', parent_code: null },
    { id: `${prefix}-wbs-02`, project_id: project.id, wbs_code: '02', name: 'Site and Civil Works', parent_code: null },
    { id: `${prefix}-wbs-03`, project_id: project.id, wbs_code: '03', name: 'Testing and Handover', parent_code: null },
  );
  activities.push(
    { id: `${prefix}-act-01`, project_id: project.id, wbs_code: '01.01', name: 'Detailed design and approval', baseline_start: project.start_date, baseline_finish: '2025-12-31', planned_duration: 120, remaining_duration: 0, planned_quantity: 1, actual_quantity: 1, unit: 'package', weightage: 15, status: 'completed', actual_start: project.start_date, actual_finish: '2025-12-20' },
    { id: `${prefix}-act-02`, project_id: project.id, wbs_code: '02.01', name: 'Earthwork and foundation', baseline_start: '2026-01-01', baseline_finish: '2026-09-30', planned_duration: 272, remaining_duration: 120, planned_quantity: 10000, actual_quantity: 10000 * progress / 100, unit: 'm3', weightage: 35, status: 'in_progress', actual_start: '2026-01-03' },
    { id: `${prefix}-act-03`, project_id: project.id, wbs_code: '02.02', name: 'Structural and permanent works', baseline_start: '2026-05-01', baseline_finish: '2027-02-28', planned_duration: 303, remaining_duration: 240, planned_quantity: 5000, actual_quantity: 5000 * progress / 200, unit: 'm3', weightage: 35, status: 'in_progress', actual_start: '2026-05-12' },
    { id: `${prefix}-act-04`, project_id: project.id, wbs_code: '03.01', name: 'Testing, commissioning and handover', baseline_start: '2027-03-01', baseline_finish: project.target_completion_date, planned_duration: 110, remaining_duration: 110, planned_quantity: 1, actual_quantity: 0, unit: 'package', weightage: 15, status: 'not_started' },
  );
  reports.push({ id: `${prefix}-report-demo`, project_id: project.id, report_date: `2026-07-${String(8 + projectIndex).padStart(2, '0')}`, weather: 'Clear / Sunny', manpower_total: 42 + projectIndex * 8, equipment_total: 7 + projectIndex, site_instructions: 'Maintain approved line and level; record verification before covering work.', obstruction_reasons: projectIndex === 1 ? 'Late delivery of reinforcement steel.' : '', next_day_plan: 'Continue priority BOQ work and close inspection requests.', submitted_by: 'Maya Rai', submitted_by_email: 'employee@buildtrack.com' });
  workItems.push({ id: `${prefix}-work-demo`, project_id: project.id, daily_report_id: `${prefix}-report-demo`, activity_id: `${prefix}-act-02`, quantity_completed: 85 + projectIndex * 12, rework_quantity: projectIndex === 2 ? 3 : 0, manpower_count: 18 + projectIndex, equipment_count: 4, delay_reason: projectIndex === 1 ? 'Material delivery behind plan.' : '' });
  expenses.push({ id: `${prefix}-expense-demo`, project_id: project.id, expense_date: `2026-07-${String(8 + projectIndex).padStart(2, '0')}`, category: projectIndex === 0 ? 'fuel' : 'material', description: projectIndex === 0 ? 'Diesel for excavator and tippers' : 'Daily construction material purchase', vendor: `Demo Vendor ${projectIndex + 1}`, amount: costs, payment_method: 'bank', reference: `PV-DEMO-${projectIndex + 1}`, wbs_code: '02.01', activity_id: `${prefix}-act-02`, employee_id: 'EMP-001', employee_name: 'Maya Rai', status: projectIndex === 0 ? 'approved' : 'submitted', recorded_by: 'Maya Rai', recorded_by_email: 'employee@buildtrack.com' });
  resources.push({ id: `${prefix}-resource-demo`, project_id: project.id, usage_date: `2026-07-${String(8 + projectIndex).padStart(2, '0')}`, activity_id: `${prefix}-act-02`, location: `Work Front ${projectIndex + 1}`, crew_name: 'Civil Crew A', manpower_skilled: 14, manpower_unskilled: 28, equipment_type: 'excavator', equipment_name: 'Excavator CAT 320', equipment_hours: 7.5, machinery_day: 1, fuel_litres: 92 + projectIndex * 7, work_quantity: 185 + projectIndex * 20, work_unit: 'm3', excavator_start_meter: 1420, excavator_end_meter: 1427.5, excavator_output: 185 + projectIndex * 20, downtime_hours: 0.5, remarks: 'Output verified against daily BOQ quantity.', recorded_by: 'Binod Tamang' });
  visits.push({ id: `${prefix}-visit-demo`, project_id: project.id, visit_date: '2026-07-12', employee_name: 'Eng. Santosh Yadav', employee_role: 'Project Manager', site_location: `Work Front ${projectIndex + 1}`, check_in: '08:15', check_out: '16:45', purpose: 'Progress review and constraint removal', vehicle_number: 'BA 2 CHA 2026', status: 'completed', recorded_by: 'Prem Chaudhary' });
  employees.push({ id: `${prefix}-employee-demo`, project_id: project.id, employee_id: 'EMP-001', name: 'Maya Rai', email: 'employee@buildtrack.com', phone: '9800000001', role: 'Field Employee', trade: 'Civil Works', site_location: `Work Front ${projectIndex + 1}`, daily_rate: 1800, status: 'active', assigned_to: project.id });
  purchaseOrders.push({ id: `${prefix}-po-demo`, project_id: project.id, po_number: `PO-${projectIndex + 1}-2026`, vendor: `Demo Vendor ${projectIndex + 1}`, item: 'Reinforcement steel', quantity: 50, unit: 'ton', unit_rate: 104000, required_date: '2026-07-15', expected_date: '2026-07-17', order_date: '2026-07-01', delivery_date: '2026-07-17', delivered_quantity: projectIndex === 1 ? 20 : 50, status: projectIndex === 1 ? 'partially_delivered' : 'delivered', remarks: projectIndex === 1 ? 'Balance delivery requires follow-up.' : 'Delivery checked by stores.' });
  storeItems.push({ id: `${prefix}-store-demo`, project_id: project.id, item_code: 'REBAR-500D', item_name: 'Reinforcement steel Fe500D', unit: 'ton', opening_stock: 12, received: 50, issued: 38 + projectIndex, reorder_level: 10, location: `Main Store ${projectIndex + 1}`, vendor: `Demo Vendor ${projectIndex + 1}`, status: 'available' });
  inventoryEvents.push({ id: `${prefix}-inventory-demo`, project_id: project.id, item_id: `${prefix}-store-demo`, event_date: '2026-07-11', event_type: 'received', quantity: 50, vendor: `Demo Vendor ${projectIndex + 1}`, location: `Main Store ${projectIndex + 1}`, remarks: 'GRN checked and stock updated.', recorded_by: 'Raju Gurung' });
  obligations.push({ id: `${prefix}-obligation-demo`, project_id: project.id, reference: `CONT-${projectIndex + 1}/NOTICE`, title: 'Submit monthly progress report', category: 'reporting', responsible_party: 'Contractor', due_date: '2026-07-15', status: 'due_soon', evidence: '', notes: 'Compile programme, cost, safety and quality sections.' });
  notifications.push({ id: `${prefix}-notification-demo`, project_id: project.id, actor: 'BuildTrack Demo Seeder', action: 'Demo project synchronized', module: 'Projects', detail: `${project.name} is ready for role-based testing.`, created_at: new Date(Date.now() - projectIndex * 3600000).toISOString(), read: false });
  financeRows.push(
    { id: `${prefix}-finance-revenue`, project_id: project.id, row_key: 'contract-revenue', name: 'Certified Revenue', category: 'revenue', monthly_values: [0, 0, 3200000, 4500000, 5700000, 6200000] },
    { id: `${prefix}-finance-cogs`, project_id: project.id, row_key: 'direct-cost', name: 'Direct Works Cost', category: 'cogs', monthly_values: [900000, 1100000, 1250000, 1420000, 1600000, 1750000] },
    { id: `${prefix}-finance-opex`, project_id: project.id, row_key: 'site-overhead', name: 'Site Overheads', category: 'opex', monthly_values: [240000, 255000, 260000, 275000, 280000, 295000] },
  );
  const ipcId = `${prefix}-ipc-demo`;
  const claimPath = `${project.id}/${director.id}/ipc_claim/${prefix}-ipc-claim.pdf`;
  const certificatePath = `${project.id}/${director.id}/ipc_certificate/${prefix}-ipc-certificate.pdf`;
  const certifiedAmount = 12000000 + projectIndex * 2500000;
  const retention = certifiedAmount * 0.1;
  const advance = certifiedAmount * 0.05;
  const netPayable = certifiedAmount - retention - advance;
  const paymentAmount = projectIndex === 1 ? 0 : projectIndex === 3 ? netPayable * 0.55 : netPayable;
  ipcs.push({
    id: ipcId, project_id: project.id, ipc_number: projectIndex + 3,
    claimed_amount: certifiedAmount * 1.08, certified_amount: certifiedAmount,
    paid_amount: paymentAmount, retention_deducted: retention, advance_recovered: advance, vat_amount: certifiedAmount * 0.13,
    status: projectIndex === 1 ? 'certified' : projectIndex === 3 ? 'partially_paid' : 'paid',
    submitted_date: `2026-06-${String(3 + projectIndex).padStart(2, '0')}`, certified_date: `2026-06-${String(12 + projectIndex).padStart(2, '0')}`,
    paid_date: paymentAmount ? `2026-06-${String(20 + projectIndex).padStart(2, '0')}` : null,
    billing_period_start: '2026-05-01', billing_period_end: '2026-05-31', invoice_reference: `IPC-DEMO-${projectIndex + 3}`,
    claim_remarks: 'Monthly measured work and approved materials on site.', claim_document_path: claimPath,
    certificate_reference: `CERT-DEMO-${projectIndex + 3}`, certified_by: 'Dr. Ramesh Thapa',
    certification_remarks: 'Certified after quantity and quality verification.', certificate_document_path: certificatePath,
  });
  if (paymentAmount) ipcPayments.push({
    id: `${prefix}-ipc-payment-demo`, project_id: project.id, ipc_id: ipcId,
    payment_date: `2026-06-${String(20 + projectIndex).padStart(2, '0')}`, amount: paymentAmount, tax_deducted: 0,
    payment_method: 'bank_transfer', bank_reference: `BANK-DEMO-${projectIndex + 1}`, paid_by: 'Employer',
    received_in_account: `Project Account ${projectIndex + 1}`, remarks: projectIndex === 3 ? 'First part-payment.' : 'Net certified amount settled.',
    proof_storage_path: `${project.id}/${director.id}/ipc_payment/${prefix}-ipc-payment.pdf`, recorded_by: 'Sarita Poudel', recorded_by_email: 'accountant@buildtrack.com',
  });
  documents.push({
    id: `${prefix}-compliance-demo`, project_id: project.id, ref_number: `COMP-DEMO-${projectIndex + 1}`,
    title: 'Monthly environmental, safety and labour compliance report', category: 'compliance_report', version: 'Rev 0',
    submitted_date: '2026-07-05', action_date: '2026-07-08', status: 'approved', owner: 'Prem Chaudhary',
    remarks: 'Monthly compliance return accepted for demonstration.', period_start: '2026-06-01', period_end: '2026-06-30',
    due_date: '2026-07-07', expiry_date: '2027-06-30', issued_by: 'Project EHS Team', responsible_person: 'Prem Chaudhary',
    storage_path: `${project.id}/${director.id}/compliance_report/${prefix}-monthly-compliance.pdf`, uploaded_by: 'Prem Chaudhary', uploaded_by_email: 'safety@buildtrack.com',
  });
});

const demoPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const evidencePaths = [
  ...ipcs.flatMap(item => [item.claim_document_path, item.certificate_document_path]),
  ...ipcPayments.map(item => item.proof_storage_path),
  ...documents.map(item => item.storage_path),
].filter(Boolean);
for (const path of evidencePaths) {
  const { error } = await admin.storage.from('project-documents').upload(path, demoPdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`project-documents/${path}: ${error.message}`);
}

await upsert('wbs_items', wbs, 'project_id,wbs_code');
await upsert('activities', activities);
await upsert('daily_reports', reports, 'project_id,report_date');
await upsert('daily_work_items', workItems);
await upsert('daily_expenses', expenses);
await upsert('daily_resource_usage', resources);
await upsert('employee_visits', visits);
await upsert('employee_profiles', employees, 'project_id,employee_id');
await upsert('procurement_orders', purchaseOrders, 'project_id,po_number');
await upsert('store_items', storeItems, 'project_id,item_code');
await upsert('inventory_events', inventoryEvents);
await upsert('contract_obligations', obligations);
await upsert('app_notifications', notifications);
await upsert('finance_rows', financeRows, 'project_id,row_key');
await upsert('ipc_submissions', ipcs, 'project_id,ipc_number');
await upsert('ipc_payments', ipcPayments);
await upsert('document_register', documents, 'project_id,ref_number');

await upsert('subscription_transactions', [
  { id: 'subscription-demo-verified', organization_id: organizationId, reference: 'BT-DEMO-RENEW-001', amount: 125000, currency: 'NPR', paid_at: '2026-07-10T08:15:00Z', period_start: '2026-07-12', period_end: '2026-08-11', payment_method: 'bank_transfer', notes: 'Verified demo renewal transaction.', status: 'verified', verified_by: platformAdmin.id, verified_at: '2026-07-10T09:00:00Z' },
  { id: 'subscription-demo-pending', organization_id: organizationId, reference: 'BT-DEMO-RENEW-002', amount: 250000, currency: 'NPR', paid_at: '2026-07-12T07:30:00Z', period_start: '2026-08-12', period_end: '2027-08-11', payment_method: 'bank_transfer', notes: 'Pending transaction for Superadmin verify-and-extend testing.', status: 'pending' },
], 'organization_id,reference');
await upsert('organization_notifications', [{ id: 'subscription-demo-payment-notice', organization_id: organizationId, kind: 'payment_received', title: 'Subscription payment awaiting verification', message: 'Payment reference BT-DEMO-RENEW-002 was recorded and is awaiting platform verification.', severity: 'info', alert_for_date: '2026-07-12', visible_until: '2026-08-11' }]);

console.log(JSON.stringify({ ok: true, businesses: 1, projects: projects.length, projectUsers: projectMembers.length, ipcs: ipcs.length, ipcPayments: ipcPayments.length, complianceDocuments: documents.length, subscriptionTransactions: 2, seededRecords: wbs.length + activities.length + reports.length + workItems.length + expenses.length + resources.length + visits.length + employees.length + purchaseOrders.length + storeItems.length + inventoryEvents.length + obligations.length + notifications.length + financeRows.length + ipcs.length + ipcPayments.length + documents.length }));
