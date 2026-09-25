// Storage and Database Adapter Layer - Multi-Project and Supabase Connect wizard
import { calculateCPM, Activity, Dependency, ProjectInfo, diffDays, addDays } from './cpm';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { FeaturePermissions } from './permissions';

// Environment variables fallback
const defaultUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const defaultAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

import { DurableMutationOutbox, createMutationId } from './durableMutationOutbox';
let cachedSupabaseClient: SupabaseClient | null = null;
let cachedSupabaseConfig = '';

// Production always uses the deployment-managed project. Runtime overrides are
// intentionally limited to local development so a browser value cannot point
// the app at an attacker-controlled authentication service.
export const getSupabaseClient = () => {
  if (typeof window === 'undefined') return null;
  const allowRuntimeOverride = process.env.NODE_ENV !== 'production';
  const url = (allowRuntimeOverride ? localStorage.getItem('bt_supabase_url') : '') || defaultUrl;
  const anonKey = (allowRuntimeOverride ? localStorage.getItem('bt_supabase_anon_key') : '') || defaultAnonKey;
  if (url && anonKey) {
    try {
      const config = `${url}|${anonKey}`;
      if (!cachedSupabaseClient || cachedSupabaseConfig !== config) {
        cachedSupabaseClient = createClient(url, anonKey);
        cachedSupabaseConfig = config;
      }
      return cachedSupabaseClient;
    } catch (e) {
      console.error('Failed to init Supabase:', e);
    }
  }
  return null;
};

export const isSupabaseConfigured = () => {
  return getSupabaseClient() !== null;
};

export interface WbsItem {
  id: string;
  project_id?: string;
  wbs_code: string;
  name: string;
  parent_code: string | null;
}

export interface FinanceRow {
  id: string;
  name: string;
  category: 'revenue' | 'cogs' | 'opex';
  values: number[];
}

export interface DocumentItem {
  id: string;
  project_id?: string;
  ref_number: string;
  title: string;
  category: 'contract' | 'security' | 'insurance' | 'rfi' | 'notice' | 'approval' | 'variation' | 'test_record' | 'permit' | 'compliance_report' | 'ipc_claim' | 'ipc_certificate' | 'payment_proof' | 'safety_report' | 'quality_report' | 'handover' | 'other';
  version: string;
  submitted_date: string;
  action_date: string | null;
  status: 'draft' | 'under_review' | 'approved' | 'rejected';
  owner: string;
  remarks: string;
  period_start?: string | null;
  period_end?: string | null;
  due_date?: string | null;
  expiry_date?: string | null;
  issued_by?: string | null;
  responsible_person?: string | null;
  linked_record_id?: string | null;
  storage_path?: string | null;
  url?: string | null;
  uploaded_by?: string | null;
  uploaded_by_email?: string | null;
}

export interface ProcurementOrder {
  id: string;
  project_id?: string;
  po_number: string;
  vendor: string;
  item: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  required_date: string;
  expected_date: string;
  order_date?: string;
  delivery_date?: string;
  delivered_quantity: number;
  status: 'draft' | 'approved' | 'ordered' | 'partially_delivered' | 'delivered' | 'cancelled';
  remarks?: string;
}

export interface StoreItem {
  id: string;
  project_id?: string;
  item_code: string;
  item_name: string;
  unit: string;
  opening_stock: number;
  received: number;
  issued: number;
  reorder_level: number;
  location: string;
  vendor?: string;
  status?: 'available' | 'low_stock' | 'ordered' | 'inactive';
}

export interface ContractObligation {
  id: string;
  project_id?: string;
  reference: string;
  title: string;
  category: 'notice' | 'security' | 'insurance' | 'approval' | 'payment' | 'reporting' | 'handover';
  responsible_party: string;
  due_date: string;
  status: 'open' | 'due_soon' | 'overdue' | 'complied' | 'waived';
  evidence: string;
  notes: string;
  complied_date?: string | null;
  compliance_remarks?: string | null;
  evidence_document_path?: string | null;
  evidence_document_url?: string | null;
}

export interface SitePhoto {
  id: string;
  project_id?: string;
  daily_report_id: string;
  name: string;
  url: string;
  storage_path?: string;
  caption: string;
  captured_at: string;
  uploaded_by?: string;
  evidence_type?: 'progress' | 'quality' | 'safety' | 'delivery' | 'attendance' | 'other';
}

export interface DailyExpense {
  id: string;
  project_id?: string;
  expense_date: string;
  category: 'labour' | 'material' | 'equipment' | 'fuel' | 'transport' | 'site_overhead' | 'subcontractor' | 'other';
  description: string;
  vendor: string;
  amount: number;
  payment_method: 'cash' | 'bank' | 'credit' | 'petty_cash';
  reference: string;
  wbs_code: string;
  activity_id?: string;
  employee_id?: string;
  employee_name?: string;
  payment_slip_url?: string;
  payment_slip_path?: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  recorded_by: string;
  recorded_by_email?: string;
}

export interface ProjectMembership {
  id: string;
  project_id: string;
  auth_user_id?: string | null;
  email: string;
  name: string;
  role: string;
  feature_permissions?: FeaturePermissions | null;
}

export interface DailyResourceUsage {
  id: string;
  project_id?: string;
  usage_date: string;
  activity_id: string;
  location: string;
  crew_name?: string;
  manpower_skilled: number;
  manpower_unskilled: number;
  equipment_type?: 'excavator' | 'loader' | 'tipper' | 'roller' | 'grader' | 'concrete_mixer' | 'tools' | 'machinery' | 'other';
  equipment_name: string;
  equipment_hours: number;
  machinery_day?: number;
  fuel_litres: number;
  work_quantity: number;
  work_unit: string;
  excavator_start_meter: number;
  excavator_end_meter: number;
  excavator_output: number;
  downtime_hours: number;
  remarks: string;
  recorded_by: string;
}

export interface EmployeeVisit {
  id: string;
  project_id?: string;
  visit_date: string;
  employee_name: string;
  employee_role: string;
  site_location: string;
  check_in: string;
  check_out: string;
  purpose: string;
  vehicle_number: string;
  status: 'planned' | 'on_site' | 'completed' | 'cancelled';
  recorded_by: string;
}

export interface EmployeeProfile {
  id: string;
  project_id?: string;
  employee_id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  trade?: string;
  site_location?: string;
  daily_rate?: number;
  status: 'active' | 'inactive';
  assigned_to?: string;
}

export interface UploadedDocument {
  id: string;
  project_id?: string;
  name: string;
  category: 'payment_slip' | 'ipc_claim' | 'ipc_certificate' | 'ipc_payment' | 'compliance_report' | 'test_report' | 'contract' | 'report' | 'drawing' | 'photo' | 'other';
  storage_path?: string;
  url?: string;
  linked_record_id?: string;
  uploaded_by?: string;
  uploaded_at: string;
  remarks?: string;
}

export interface AppNotification {
  id: string;
  project_id?: string;
  actor?: string;
  action: string;
  module: string;
  detail: string;
  created_at: string;
  read: boolean;
}

export interface InventoryEvent {
  id: string;
  project_id?: string;
  item_id?: string;
  event_date: string;
  event_type: 'received' | 'issued' | 'adjusted' | 'moved';
  quantity: number;
  vendor?: string;
  location?: string;
  remarks?: string;
  recorded_by?: string;
}

export interface HandoverItem {
  id: string;
  project_id?: string;
  item_name: string;
  category: string;
  status: 'pending' | 'approved';
  approved_by: string | null;
  approved_date: string | null;
  responsible_party?: string | null;
  due_date?: string | null;
  remarks?: string | null;
  completion_remarks?: string | null;
  evidence_document_path?: string | null;
  evidence_document_url?: string | null;
}

export interface DefectEntry {
  id: string;
  project_id?: string;
  defect_description: string;
  reported_date: string;
  responsible_team: string;
  rectification_deadline: string;
  status: 'pending' | 'rectified' | 'verified';
  location?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  activity_id?: string | null;
  reported_document_path?: string | null;
  reported_document_url?: string | null;
  closure_document_path?: string | null;
  closure_document_url?: string | null;
  closure_remarks?: string | null;
  verified_by?: string | null;
  verified_date?: string | null;
}

export interface IpcEntry {
  id: string;
  project_id?: string;
  ipc_number: number;
  claimed_amount: number;
  certified_amount: number;
  retention_deducted: number;
  advance_recovered: number;
  paid_amount: number;
  status: 'pending' | 'certified' | 'paid' | 'partially_paid';
  submitted_date: string;
  certified_date?: string | null;
  paid_date?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  invoice_reference?: string | null;
  claim_remarks?: string | null;
  claim_document_path?: string | null;
  claim_document_url?: string | null;
  certificate_reference?: string | null;
  certified_by?: string | null;
  certification_remarks?: string | null;
  certificate_document_path?: string | null;
  certificate_document_url?: string | null;
}

export interface IpcPayment {
  id: string;
  project_id?: string;
  ipc_id: string;
  payment_date: string;
  amount: number;
  tax_deducted: number;
  payment_method: 'bank_transfer' | 'cheque' | 'cash' | 'other';
  bank_reference: string;
  paid_by?: string;
  received_in_account?: string;
  remarks?: string;
  proof_storage_path?: string;
  proof_url?: string;
  recorded_by?: string;
  recorded_by_email?: string;
  created_at?: string;
}

const MOCK_IPC: IpcEntry[] = [
  {
    id: 'ipc-1',
    project_id: 'proj-101',
    ipc_number: 1,
    claimed_amount: 32000000.00,
    certified_amount: 28000000.00,
    retention_deducted: 2800000.00,
    advance_recovered: 5000000.00,
    paid_amount: 20200000.00,
    status: 'paid',
    submitted_date: '2025-03-10',
    certified_date: '2025-03-25',
    paid_date: '2025-04-02',
  },
  {
    id: 'ipc-2',
    project_id: 'proj-101',
    ipc_number: 2,
    claimed_amount: 45000000.00,
    certified_amount: 41000000.00,
    retention_deducted: 4100000.00,
    advance_recovered: 5000000.00,
    paid_amount: 0,
    status: 'certified',
    submitted_date: '2025-05-15',
    certified_date: '2025-05-30',
    paid_date: null,
  }
];

const MOCK_IPC_PAYMENTS: IpcPayment[] = [{
  id: 'ipc-payment-1', project_id: 'proj-101', ipc_id: 'ipc-1', payment_date: '2025-04-02',
  amount: 20200000, tax_deducted: 0, payment_method: 'bank_transfer', bank_reference: 'NIMB-IPC1-0402',
  paid_by: 'Employer', received_in_account: 'Project Operating Account', remarks: 'First IPC settlement.',
  recorded_by: 'Sarita Poudel', recorded_by_email: 'accountant@buildtrack.com', created_at: '2025-04-02T10:00:00Z',
}];

// ==========================================
// MOCK DATA GENERATOR FOR LOCAL STORAGE FALLBACK
// ==========================================
const MOCK_PROJECT = {
  id: 'proj-101',
  name: 'Kathmandu-Terai Fast Track (Expressway) Project - Section 3 (Design & Build)',
  contract_number: 'EE-DB-03/080-81',
  contract_amount: 250000000.00, // NPR 250M
  currency: 'NPR',
  start_date: '2025-01-01',
  contract_duration_days: 900,
  target_completion_date: '2027-06-19',
  jv_status: 'jv' as const,
  lead_partner: 'Mero Construction Pvt. Ltd.',
  other_partners: ['Himalayan Builders Ltd.']
};

const DEMO_PROJECTS = [
  {
    id: 'proj-demo-airport',
    name: 'Pokhara Regional Airport Terminal Expansion (D&B)',
    contract_number: 'CAAN/DB/TERMINAL-02',
    contract_amount: 185000000,
    currency: 'NPR',
    start_date: '2025-09-01',
    contract_duration_days: 640,
    target_completion_date: '2027-06-03',
    jv_status: 'jv' as const,
    lead_partner: 'Himal Design Build Pvt. Ltd.',
    other_partners: ['Gandaki MEP Solutions']
  },
  {
    id: 'proj-demo-water',
    name: 'Melamchi Water Treatment Plant Upgrade (D&B)',
    contract_number: 'KUKL/WTP/DB-07',
    contract_amount: 320000000,
    currency: 'NPR',
    start_date: '2025-04-15',
    contract_duration_days: 820,
    target_completion_date: '2027-07-14',
    jv_status: 'solo' as const,
    lead_partner: 'Nepal Hydro Infrastructure Ltd.',
    other_partners: []
  },
  {
    id: 'proj-demo-hospital',
    name: 'Biratnagar Provincial Hospital Block (D&B)',
    contract_number: 'MOHP/DB/HOSP-11',
    contract_amount: 145000000,
    currency: 'NPR',
    start_date: '2025-11-10',
    contract_duration_days: 540,
    target_completion_date: '2027-05-04',
    jv_status: 'solo' as const,
    lead_partner: 'Koshi Builders Pvt. Ltd.',
    other_partners: []
  }
];

const MOCK_USERS = [
  { id: 'usr-1', email: 'admin@buildtrack.com', name: 'Arjun Adhikari', role: 'super_admin' },
  { id: 'usr-11', email: 'businessadmin@buildtrack.com', name: 'Nisha Karki', role: 'business_admin' },
  { id: 'usr-2', email: 'director@buildtrack.com', name: 'Dr. Ramesh Thapa', role: 'project_director' },
  { id: 'usr-3', email: 'pm@buildtrack.com', name: 'Eng. Santosh Yadav', role: 'project_manager' },
  { id: 'usr-4', email: 'planning@buildtrack.com', name: 'Sujita Shrestha', role: 'planning_engineer' },
  { id: 'usr-5', email: 'site@buildtrack.com', name: 'Binod Tamang', role: 'site_engineer' },
  { id: 'usr-6', email: 'qs@buildtrack.com', name: 'Gopal Bhatta', role: 'qs_billing_engineer' },
  { id: 'usr-7', email: 'design@buildtrack.com', name: 'Sunita Pradhan', role: 'design_coordinator' },
  { id: 'usr-8', email: 'qaqc@buildtrack.com', name: 'Kiran KC', role: 'qa_qc_engineer' },
  { id: 'usr-9', email: 'safety@buildtrack.com', name: 'Prem Chaudhary', role: 'safety_officer' },
  { id: 'usr-10', email: 'employer@buildtrack.com', name: 'Govind Raj Pandey', role: 'employer_viewer' },
  { id: 'usr-12', email: 'employee@buildtrack.com', name: 'Maya Rai', role: 'field_employee' },
  { id: 'usr-13', email: 'accountant@buildtrack.com', name: 'Sarita Poudel', role: 'accountant' },
  { id: 'usr-14', email: 'store@buildtrack.com', name: 'Raju Gurung', role: 'store_officer' }
];

const LOCAL_DEMO_EMAILS = new Set(MOCK_USERS.map(user => user.email.toLowerCase()));

function resolveLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  if (normalized === 'superadmin' || normalized === 'admin') return 'admin@buildtrack.com';
  if (normalized === 'director') return 'director@buildtrack.com';
  return normalized;
}

function isNetworkLikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|failed to fetch|network|enotfound|dns|timeout|load failed/i.test(message);
}

async function signInWithLocalFallback(email: string, password: string) {
  const response = await fetch('/api/auth/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Sign-in failed.');
  return data;
}

async function getVerifiedLocalDemoUser() {
  const response = await fetch('/api/auth/local', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.user as { id?: string; name: string; email: string; role: string } | null;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadToTenantGoogleDrive(
  file: File,
  category: 'daily_report' | 'expense' | 'employee' | 'photo' | 'document',
  metadata: { date?: string; employee?: string; boq?: string; remarks?: string; reference?: string } = {}
) {
  const session = await storage.getAuthSession();
  if (!session) return null;
  const projectId = getActiveProjectId();
  const status = await fetch(`/api/google/status?projectId=${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  }).then(response => response.json()).catch(() => null);
  if (!status?.connected) return null;
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  Object.entries(metadata).forEach(([key, value]) => {
    if (value) form.append(key, value);
  });
  const response = await fetch('/api/google/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'X-BuildTrack-Project': projectId },
    body: form,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.message || 'Google Drive upload failed.');
  return result.file as { id: string; name: string; webViewLink?: string; folderId?: string };
}

const MOCK_WBS = [
  { id: 'wbs-1', project_id: 'proj-101', wbs_code: '01', name: 'Design & Approvals', parent_code: null },
  { id: 'wbs-2', project_id: 'proj-101', wbs_code: '01.01', name: 'Concept Design', parent_code: '01' },
  { id: 'wbs-3', project_id: 'proj-101', wbs_code: '01.02', name: 'Detailed Design', parent_code: '01' },
  { id: 'wbs-4', project_id: 'proj-101', wbs_code: '01.03', name: 'IFC Drawings', parent_code: '01' },
  { id: 'wbs-5', project_id: 'proj-101', wbs_code: '02', name: 'Site Investigation & Mobilization', parent_code: null },
  { id: 'wbs-6', project_id: 'proj-101', wbs_code: '03', name: 'Earthworks & Foundation', parent_code: null },
  { id: 'wbs-7', project_id: 'proj-101', wbs_code: '04', name: 'Concrete Works & Superstructure', parent_code: null },
  { id: 'wbs-8', project_id: 'proj-101', wbs_code: '05', name: 'Testing & Handover', parent_code: null }
];

const MOCK_ACTIVITIES: any[] = [
  {
    id: 'act-101',
    project_id: 'proj-101',
    wbs_code: '01.01',
    name: 'Concept Design Approval',
    baseline_start: '2025-01-01',
    baseline_finish: '2025-01-31',
    planned_duration: 30,
    actual_start: '2025-01-01',
    actual_finish: '2025-01-30',
    planned_quantity: 1,
    actual_quantity: 1,
    unit: 'Pkg',
    weightage: 5.0,
    resource_required: 'Design Engineers',
    productivity_rate: 0.03,
    status: 'completed'
  },
  {
    id: 'act-102',
    project_id: 'proj-101',
    wbs_code: '01.02',
    name: 'Detailed Engineering Design',
    baseline_start: '2025-02-01',
    baseline_finish: '2025-04-01',
    planned_duration: 60,
    actual_start: '2025-01-28',
    actual_finish: '2025-04-12', // Delayed finish
    planned_quantity: 1,
    actual_quantity: 1,
    unit: 'Pkg',
    weightage: 10.0,
    resource_required: 'Design/Structure Engineers',
    productivity_rate: 0.016,
    status: 'completed'
  },
  {
    id: 'act-103',
    project_id: 'proj-101',
    wbs_code: '01.03',
    name: 'IFC Drawings Approval',
    baseline_start: '2025-04-02',
    baseline_finish: '2025-05-02',
    planned_duration: 30,
    actual_start: '2025-04-10',
    actual_finish: null,
    remaining_duration: 15,
    planned_quantity: 1,
    actual_quantity: 0.6,
    unit: 'Pkg',
    weightage: 5.0,
    resource_required: 'Coordinator/Approving Authority',
    productivity_rate: 0.03,
    status: 'in_progress'
  },
  {
    id: 'act-201',
    project_id: 'proj-101',
    wbs_code: '02.01',
    name: 'Topographic Survey & Geotech',
    baseline_start: '2025-02-01',
    baseline_finish: '2025-02-21',
    planned_duration: 20,
    actual_start: '2025-02-01',
    actual_finish: '2025-02-20',
    planned_quantity: 1,
    actual_quantity: 1,
    unit: 'Pkg',
    weightage: 3.0,
    resource_required: 'Geologists & Surveyors',
    productivity_rate: 0.05,
    status: 'completed'
  },
  {
    id: 'act-202',
    project_id: 'proj-101',
    wbs_code: '02.02',
    name: 'Camp Construction & Mobilization',
    baseline_start: '2025-02-01',
    baseline_finish: '2025-03-03',
    planned_duration: 30,
    actual_start: '2025-02-05',
    actual_finish: '2025-03-12',
    planned_quantity: 1,
    actual_quantity: 1,
    unit: 'Pkg',
    weightage: 2.0,
    resource_required: 'Site Staff/Equipment',
    productivity_rate: 0.03,
    status: 'completed'
  },
  {
    id: 'act-301',
    project_id: 'proj-101',
    wbs_code: '03.01',
    name: 'Excavation in Soil & Soft Rock',
    baseline_start: '2025-05-03',
    baseline_finish: '2025-07-31',
    planned_duration: 90,
    actual_start: '2025-05-05',
    actual_finish: null,
    remaining_duration: 75,
    planned_quantity: 100000,
    actual_quantity: 25000,
    unit: 'm³',
    weightage: 15.0,
    resource_required: 'Excavators & Dumpers',
    productivity_rate: 1100,
    status: 'in_progress'
  },
  {
    id: 'act-302',
    project_id: 'proj-101',
    wbs_code: '03.02',
    name: 'Plain Cement Concrete (PCC) Bedding',
    baseline_start: '2025-05-13',
    baseline_finish: '2025-06-26',
    planned_duration: 45,
    actual_start: '2025-05-20',
    actual_finish: null,
    remaining_duration: 40,
    planned_quantity: 5000,
    actual_quantity: 800,
    unit: 'm³',
    weightage: 5.0,
    resource_required: 'Concrete Transit Mixers',
    productivity_rate: 111,
    status: 'in_progress'
  },
  {
    id: 'act-303',
    project_id: 'proj-101',
    wbs_code: '03.03',
    name: 'Rebar & Formwork for Foundation',
    baseline_start: '2025-05-18',
    baseline_finish: '2025-07-16',
    planned_duration: 60,
    actual_start: null,
    actual_finish: null,
    planned_quantity: 850,
    actual_quantity: 0,
    unit: 'Ton',
    weightage: 10.0,
    resource_required: 'Steel Fixers & Carpenters',
    productivity_rate: 14.1,
    status: 'not_started'
  },
  {
    id: 'act-401',
    project_id: 'proj-101',
    wbs_code: '04.01',
    name: 'Concreting Foundation & Substructure',
    baseline_start: '2025-07-17',
    baseline_finish: '2025-10-14',
    planned_duration: 90,
    actual_start: null,
    actual_finish: null,
    planned_quantity: 12000,
    actual_quantity: 0,
    unit: 'm³',
    weightage: 15.0,
    resource_required: 'Batching Plant & Concrete Pumps',
    productivity_rate: 133,
    status: 'not_started'
  },
  {
    id: 'act-402',
    project_id: 'proj-101',
    wbs_code: '04.02',
    name: 'Columns & Piers Concrete',
    baseline_start: '2025-10-15',
    baseline_finish: '2026-01-12',
    planned_duration: 90,
    actual_start: null,
    actual_finish: null,
    planned_quantity: 8000,
    actual_quantity: 0,
    unit: 'm³',
    weightage: 10.0,
    resource_required: 'Transit Mixers & Shuttering',
    productivity_rate: 88.8,
    status: 'not_started'
  },
  {
    id: 'act-403',
    project_id: 'proj-101',
    wbs_code: '04.03',
    name: 'Deck Slab Casting',
    baseline_start: '2026-01-13',
    baseline_finish: '2026-05-12',
    planned_duration: 120,
    actual_start: null,
    actual_finish: null,
    planned_quantity: 15000,
    actual_quantity: 0,
    unit: 'm³',
    weightage: 15.0,
    resource_required: 'High Capacity Concrete Pumps',
    productivity_rate: 125,
    status: 'not_started'
  },
  {
    id: 'act-501',
    project_id: 'proj-101',
    wbs_code: '05.01',
    name: 'Testing & Commissioning',
    baseline_start: '2026-05-13',
    baseline_finish: '2026-06-11',
    planned_duration: 30,
    actual_start: null,
    actual_finish: null,
    planned_quantity: 1,
    actual_quantity: 0,
    unit: 'Pkg',
    weightage: 5.0,
    resource_required: 'Testing Engineers & Consultants',
    productivity_rate: 0.03,
    status: 'not_started'
  },
  {
    id: 'act-502',
    project_id: 'proj-101',
    wbs_code: '05.02',
    name: 'As-Built Drawings & Handover',
    baseline_start: '2026-06-12',
    baseline_finish: '2026-07-01',
    planned_duration: 20,
    actual_start: null,
    actual_finish: null,
    planned_quantity: 1,
    actual_quantity: 0,
    unit: 'Pkg',
    weightage: 5.0,
    resource_required: 'As-Built Drafters & Handover team',
    productivity_rate: 0.05,
    status: 'not_started'
  }
];

const MOCK_DEPENDENCIES: Dependency[] = [
  { id: 'dep-1', project_id: 'proj-101', predecessor_id: 'act-101', successor_id: 'act-102', type: 'FS', lag: 0 },
  { id: 'dep-2', project_id: 'proj-101', predecessor_id: 'act-102', successor_id: 'act-103', type: 'FS', lag: 0 },
  { id: 'dep-3', project_id: 'proj-101', predecessor_id: 'act-101', successor_id: 'act-201', type: 'FS', lag: 0 },
  { id: 'dep-4', project_id: 'proj-101', predecessor_id: 'act-101', successor_id: 'act-202', type: 'FS', lag: 0 },
  { id: 'dep-5', project_id: 'proj-101', predecessor_id: 'act-103', successor_id: 'act-301', type: 'FS', lag: 0 },
  { id: 'dep-6', project_id: 'proj-101', predecessor_id: 'act-201', successor_id: 'act-301', type: 'FS', lag: 0 },
  { id: 'dep-7', project_id: 'proj-101', predecessor_id: 'act-301', successor_id: 'act-302', type: 'SS', lag: 10 },
  { id: 'dep-8', project_id: 'proj-101', predecessor_id: 'act-302', successor_id: 'act-303', type: 'SS', lag: 5 },
  { id: 'dep-9', project_id: 'proj-101', predecessor_id: 'act-303', successor_id: 'act-401', type: 'FS', lag: 0 },
  { id: 'dep-10', project_id: 'proj-101', predecessor_id: 'act-401', successor_id: 'act-402', type: 'FS', lag: 0 },
  { id: 'dep-11', project_id: 'proj-101', predecessor_id: 'act-402', successor_id: 'act-403', type: 'FS', lag: 0 },
  { id: 'dep-12', project_id: 'proj-101', predecessor_id: 'act-403', successor_id: 'act-501', type: 'FS', lag: 0 },
  { id: 'dep-13', project_id: 'proj-101', predecessor_id: 'act-501', successor_id: 'act-502', type: 'FS', lag: 0 }
];

const MOCK_DESIGN_PACKAGES = [
  {
    id: 'des-1',
    project_id: 'proj-101',
    name: 'Concept Design (Expressway alignment)',
    category: 'concept',
    status: 'approved',
    submitted_date: '2025-01-05',
    review_due_date: '2025-01-20',
    approved_date: '2025-01-30',
    delay_days: 10,
    construction_impact: 'Minor alignment shifts requested'
  },
  {
    id: 'des-2',
    project_id: 'proj-101',
    name: 'Detailed Structural Design (Piers & Abutments)',
    category: 'detailed',
    status: 'approved',
    submitted_date: '2025-02-15',
    review_due_date: '2025-03-15',
    approved_date: '2025-04-12',
    delay_days: 28,
    construction_impact: 'Pushed back foundation execution start date'
  },
  {
    id: 'des-3',
    project_id: 'proj-101',
    name: 'IFC Drawings (Package 03 - Bridge Foundations)',
    category: 'ifc_drawings',
    status: 'under_review',
    submitted_date: '2025-04-10',
    review_due_date: '2025-05-10',
    approved_date: null,
    delay_days: 43,
    construction_impact: 'Excavation progressing with field mockups'
  }
];

const MOCK_DAILY_REPORTS = [
  {
    id: 'rep-1',
    project_id: 'proj-101',
    report_date: '2025-06-20',
    weather: 'Sunny / Monsoon showers after 4 PM',
    manpower_total: 45,
    equipment_total: 6,
    site_instructions: 'Client engineer requested density testing at Chainage 12+500.',
    obstruction_reasons: 'Heavy rain after 4 PM halted concreting works for 2 hours.',
    next_day_plan: 'Continue soil excavation, setup rebar cutting machine at Yard B.',
    submitted_by: 'Binod Tamang',
    submitted_at: '2025-06-20T18:30:00Z'
  },
  {
    id: 'rep-2',
    project_id: 'proj-101',
    report_date: '2025-06-21',
    weather: 'Clear / Sunny',
    manpower_total: 52,
    equipment_total: 8,
    site_instructions: 'Ensure safety harness compliance during scaffolding setup.',
    obstruction_reasons: 'Minor mechanical breakdown on Excavator EX-04 resolved in 1 hour.',
    next_day_plan: 'PCC pouring at Pier 2 foundation, rebar assembly.',
    submitted_by: 'Binod Tamang',
    submitted_at: '2025-06-21T17:45:00Z'
  }
];

const MOCK_DAILY_WORK_ITEMS = [
  { id: 'wi-1', daily_report_id: 'rep-2', activity_id: 'act-301', quantity_completed: 1200, manpower_count: 18, equipment_count: 3, delay_reason: '', photo_url: '' },
  { id: 'wi-2', daily_report_id: 'rep-2', activity_id: 'act-302', quantity_completed: 150, manpower_count: 12, equipment_count: 2, delay_reason: 'Mixer delay due to traffic', photo_url: '' }
];

const MOCK_MATERIAL_LOGS = [
  { id: 'mat-1', daily_report_id: 'rep-2', material_name: 'OPC Cement', unit: 'Bags', received_qty: 400, consumed_qty: 280, vendor: 'Shivam Cement Ltd.' }
];

const MOCK_BUDGET_HEADS = [
  { id: 'bdg-1', project_id: 'proj-101', wbs_code: '01', name: 'Design and Engineering Documents', contract_value: 50000000.00, internal_budget: 35000000.00, actual_cost: 38200000.00, committed_cost: 0 },
  { id: 'bdg-2', project_id: 'proj-101', wbs_code: '02', name: 'Mobilization & Investigations', contract_value: 12500000.00, internal_budget: 10000000.00, actual_cost: 9800000.00, committed_cost: 500000 },
  { id: 'bdg-3', project_id: 'proj-101', wbs_code: '03', name: 'Earthworks & Foundation Works', contract_value: 75000000.00, internal_budget: 62000000.00, actual_cost: 16500000.00, committed_cost: 8500000 },
  { id: 'bdg-4', project_id: 'proj-101', wbs_code: '04', name: 'Superstructure Concrete works', contract_value: 100000000.00, internal_budget: 85000000.00, actual_cost: 0, committed_cost: 12000000 },
  { id: 'bdg-5', project_id: 'proj-101', wbs_code: '05', name: 'Testing, Handover & Defects Period', contract_value: 12500000.00, internal_budget: 8000000.00, actual_cost: 0, committed_cost: 0 }
];

const MOCK_SUBCONTRACTORS = [
  { id: 'sub-1', project_id: 'proj-101', wbs_code: '03.01', subcontractor_name: 'Karnali Earthmovers Pvt. Ltd.', package_name: 'Bulk Earthwork Excavation & Hauling', contract_value: 18000000.00, actual_cost: 4500000.00, progress_percentage: 25.0 }
];

const MOCK_QA_QC = [
  { id: 'qa-1', project_id: 'proj-101', activity_id: 'act-301', qa_item: 'Compaction Test for Embankment Fill - Chainage 12+200', inspection_date: '2025-05-20', status: 'passed' as const, ncr_number: null, ncr_open_days: 0, test_result_details: 'Achieved dry density 98.4% (Passed).' },
  { id: 'qa-2', project_id: 'proj-101', activity_id: 'act-302', qa_item: 'Slump & Cube Test for PCC Bedding - Pier 1 Footing', inspection_date: '2025-06-02', status: 'failed' as const, ncr_number: 'NCR-001', ncr_open_days: 20, test_result_details: 'Cube strength resulted in 11.2 MPa (required 15 MPa).' }
];

const MOCK_SAFETY = [
  { id: 'sf-1', project_id: 'proj-101', log_date: '2025-06-20', toolbox_talks: 2, incidents: 0, near_misses: 1, permits_issued: 3, environmental_complaints: 0 },
  { id: 'sf-2', project_id: 'proj-101', log_date: '2025-06-21', toolbox_talks: 3, incidents: 0, near_misses: 0, permits_issued: 4, environmental_complaints: 0 }
];

const MOCK_VARIATIONS_CLAIMS = [
  { id: 'clm-1', project_id: 'proj-101', type: 'claim_eot' as const, reference_id: 'CLM-EOT-01', title: 'Extension of Time (EOT) for Design Review Delay by Employer', event_date: '2025-02-15', notice_date: '2025-03-01', time_impact_days: 28, cost_impact_amount: 1200000.00, status: 'submitted' as const, supporting_docs: [], employer_decision_ref: 'Pending' }
];

const MOCK_RISKS = [
  { id: 'rsk-1', project_id: 'proj-101', wbs_code: '03.01', risk_description: 'Monsoon Flooding of Foundation Pit', category: 'weather' as const, probability: 4, impact: 5, mitigation_action: 'Maintain standby water pumps.', status: 'monitoring' as const }
];

const MOCK_HANDOVER: HandoverItem[] = [
  { id: 'ho-1', item_name: 'Bridge structural concrete testing dossier', category: 'test_certs', status: 'pending', approved_by: null, approved_date: null }
];

const MOCK_DEFECTS: DefectEntry[] = [
  { id: 'def-1', project_id: 'proj-101', defect_description: 'Hairline cracks in concrete curb of Pier 1 cap', reported_date: '2025-06-15', responsible_team: 'Subcontractor - Concrete Cast', rectification_deadline: '2025-06-30', status: 'pending' }
];

const DEMO_ACTIVITIES: Array<Activity & { project_id: string }> = [
  {
    id: 'air-act-1', project_id: 'proj-demo-airport', wbs_code: '01.01', name: 'Terminal Detailed Design & IFC Approval',
    baseline_start: '2025-09-01', baseline_finish: '2025-11-29', planned_duration: 90,
    actual_start: '2025-09-01', actual_finish: '2025-12-18', planned_quantity: 1, actual_quantity: 1,
    unit: 'Pkg', weightage: 15, resource_required: 'Architectural and MEP design team', productivity_rate: 0.011, status: 'completed'
  },
  {
    id: 'air-act-2', project_id: 'proj-demo-airport', wbs_code: '02.01', name: 'Apron Utility Diversion & Excavation',
    baseline_start: '2025-11-30', baseline_finish: '2026-03-29', planned_duration: 120,
    actual_start: '2025-12-20', actual_finish: null, remaining_duration: 55, planned_quantity: 28000, actual_quantity: 17200,
    unit: 'm³', weightage: 25, resource_required: 'Excavators, survey and utility crew', productivity_rate: 233, status: 'in_progress'
  },
  {
    id: 'air-act-3', project_id: 'proj-demo-airport', wbs_code: '03.01', name: 'Terminal RCC Frame & Roof',
    baseline_start: '2026-03-30', baseline_finish: '2026-11-24', planned_duration: 240,
    actual_start: null, actual_finish: null, planned_quantity: 7800, actual_quantity: 0,
    unit: 'm³', weightage: 40, resource_required: 'RCC, steel and formwork crews', productivity_rate: 32.5, status: 'not_started'
  },
  {
    id: 'air-act-4', project_id: 'proj-demo-airport', wbs_code: '04.01', name: 'MEP Testing, ORAT & Handover',
    baseline_start: '2026-11-25', baseline_finish: '2027-05-23', planned_duration: 180,
    actual_start: null, actual_finish: null, planned_quantity: 1, actual_quantity: 0,
    unit: 'Pkg', weightage: 20, resource_required: 'MEP commissioning and airport ORAT team', productivity_rate: 0.006, status: 'not_started'
  },
  {
    id: 'water-act-1', project_id: 'proj-demo-water', wbs_code: '01.01', name: 'Process Design and Hydraulic Model',
    baseline_start: '2025-04-15', baseline_finish: '2025-07-13', planned_duration: 90,
    actual_start: '2025-04-15', actual_finish: '2025-07-30', planned_quantity: 1, actual_quantity: 1,
    unit: 'Pkg', weightage: 12, resource_required: 'Process and hydraulic engineers', productivity_rate: 0.011, status: 'completed'
  },
  {
    id: 'water-act-2', project_id: 'proj-demo-water', wbs_code: '02.01', name: 'Intake, Clarifier and Filter Civil Works',
    baseline_start: '2025-07-14', baseline_finish: '2026-07-08', planned_duration: 360,
    actual_start: '2025-08-01', actual_finish: null, remaining_duration: 165, planned_quantity: 18500, actual_quantity: 9200,
    unit: 'm³', weightage: 45, resource_required: 'Civil, dewatering and concrete crews', productivity_rate: 51.4, status: 'in_progress'
  },
  {
    id: 'water-act-3', project_id: 'proj-demo-water', wbs_code: '03.01', name: 'Mechanical Process Equipment Installation',
    baseline_start: '2026-03-01', baseline_finish: '2026-11-25', planned_duration: 270,
    actual_start: '2026-04-05', actual_finish: null, remaining_duration: 220, planned_quantity: 42, actual_quantity: 8,
    unit: 'No.', weightage: 28, resource_required: 'Mechanical installation specialists', productivity_rate: 0.16, status: 'in_progress'
  },
  {
    id: 'water-act-4', project_id: 'proj-demo-water', wbs_code: '04.01', name: 'Performance Testing & Operator Training',
    baseline_start: '2026-11-26', baseline_finish: '2027-04-24', planned_duration: 150,
    actual_start: null, actual_finish: null, planned_quantity: 1, actual_quantity: 0,
    unit: 'Pkg', weightage: 15, resource_required: 'Commissioning chemists and trainers', productivity_rate: 0.007, status: 'not_started'
  },
  {
    id: 'hosp-act-1', project_id: 'proj-demo-hospital', wbs_code: '01.01', name: 'Hospital Design, Medical Planning & Approvals',
    baseline_start: '2025-11-10', baseline_finish: '2026-02-07', planned_duration: 90,
    actual_start: '2025-11-10', actual_finish: '2026-03-02', planned_quantity: 1, actual_quantity: 1,
    unit: 'Pkg', weightage: 15, resource_required: 'Architect, medical planner and structural team', productivity_rate: 0.011, status: 'completed'
  },
  {
    id: 'hosp-act-2', project_id: 'proj-demo-hospital', wbs_code: '02.01', name: 'Foundation and Basement Construction',
    baseline_start: '2026-02-08', baseline_finish: '2026-06-07', planned_duration: 120,
    actual_start: '2026-03-03', actual_finish: null, remaining_duration: 36, planned_quantity: 4200, actual_quantity: 3150,
    unit: 'm³', weightage: 30, resource_required: 'Excavation, waterproofing and RCC crews', productivity_rate: 35, status: 'in_progress'
  },
  {
    id: 'hosp-act-3', project_id: 'proj-demo-hospital', wbs_code: '03.01', name: 'Superstructure, Envelope and Medical MEP',
    baseline_start: '2026-06-08', baseline_finish: '2027-01-03', planned_duration: 210,
    actual_start: null, actual_finish: null, planned_quantity: 1, actual_quantity: 0,
    unit: 'Pkg', weightage: 40, resource_required: 'RCC, facade and hospital MEP contractors', productivity_rate: 0.005, status: 'not_started'
  },
  {
    id: 'hosp-act-4', project_id: 'proj-demo-hospital', wbs_code: '04.01', name: 'Medical Equipment Commissioning & Handover',
    baseline_start: '2027-01-04', baseline_finish: '2027-04-03', planned_duration: 90,
    actual_start: null, actual_finish: null, planned_quantity: 1, actual_quantity: 0,
    unit: 'Pkg', weightage: 15, resource_required: 'Medical equipment and commissioning team', productivity_rate: 0.011, status: 'not_started'
  }
];

const DEMO_DEPENDENCIES: Dependency[] = [
  { id: 'air-dep-1', project_id: 'proj-demo-airport', predecessor_id: 'air-act-1', successor_id: 'air-act-2', type: 'FS', lag: 0 },
  { id: 'air-dep-2', project_id: 'proj-demo-airport', predecessor_id: 'air-act-2', successor_id: 'air-act-3', type: 'FS', lag: 0 },
  { id: 'air-dep-3', project_id: 'proj-demo-airport', predecessor_id: 'air-act-3', successor_id: 'air-act-4', type: 'FS', lag: 0 },
  { id: 'water-dep-1', project_id: 'proj-demo-water', predecessor_id: 'water-act-1', successor_id: 'water-act-2', type: 'FS', lag: 0 },
  { id: 'water-dep-2', project_id: 'proj-demo-water', predecessor_id: 'water-act-2', successor_id: 'water-act-3', type: 'SS', lag: 230 },
  { id: 'water-dep-3', project_id: 'proj-demo-water', predecessor_id: 'water-act-3', successor_id: 'water-act-4', type: 'FS', lag: 0 },
  { id: 'hosp-dep-1', project_id: 'proj-demo-hospital', predecessor_id: 'hosp-act-1', successor_id: 'hosp-act-2', type: 'FS', lag: 0 },
  { id: 'hosp-dep-2', project_id: 'proj-demo-hospital', predecessor_id: 'hosp-act-2', successor_id: 'hosp-act-3', type: 'FS', lag: 0 },
  { id: 'hosp-dep-3', project_id: 'proj-demo-hospital', predecessor_id: 'hosp-act-3', successor_id: 'hosp-act-4', type: 'FS', lag: 0 }
];

const DEMO_DESIGN_PACKAGES = DEMO_PROJECTS.map((project, index) => ({
  id: `demo-design-${index + 1}`,
  project_id: project.id,
  name: index === 0 ? 'Baggage Handling and Fire Strategy IFC Package' : index === 1 ? 'Filter Gallery Process IFC Package' : 'Medical Gas and OT Coordination Package',
  category: 'ifc_drawings',
  status: index === 1 ? 'approved_with_comments' : 'under_review',
  submitted_date: index === 0 ? '2026-05-12' : index === 1 ? '2026-04-18' : '2026-05-28',
  review_due_date: index === 0 ? '2026-06-02' : index === 1 ? '2026-05-09' : '2026-06-18',
  approved_date: index === 1 ? '2026-05-20' : null,
  delay_days: index === 0 ? 21 : index === 1 ? 11 : 5,
  construction_impact: index === 0 ? 'Delays ceiling coordination and MEP procurement.' : index === 1 ? 'Comments incorporated before equipment fabrication.' : 'Blocks operating theatre ceiling closure.'
}));

const DEMO_BUDGET_HEADS = DEMO_PROJECTS.flatMap((project, index) => {
  const values = index === 0 ? [28000000, 46000000, 82000000, 29000000] : index === 1 ? [38000000, 144000000, 96000000, 42000000] : [22000000, 42000000, 59000000, 22000000];
  return values.map((value, itemIndex) => ({
    id: `demo-bdg-${index + 1}-${itemIndex + 1}`,
    project_id: project.id,
    wbs_code: `0${itemIndex + 1}`,
    name: ['Design & Approvals', 'Civil Works', 'Specialist Systems', 'Testing & Handover'][itemIndex],
    contract_value: value,
    internal_budget: value * 0.84,
    actual_cost: itemIndex < 2 ? value * (index === 1 ? 0.47 : 0.36) : value * 0.08,
    committed_cost: itemIndex < 3 ? value * 0.22 : 0
  }));
});

const DEMO_IPCS: IpcEntry[] = DEMO_PROJECTS.map((project, index) => ({
  id: `demo-ipc-${index + 1}`,
  project_id: project.id,
  ipc_number: index + 3,
  claimed_amount: [28500000, 52000000, 21600000][index],
  certified_amount: [26100000, 47500000, 19400000][index],
  retention_deducted: [2610000, 4750000, 1940000][index],
  advance_recovered: [1850000, 3200000, 1450000][index],
  paid_amount: [21640000, 0, 16010000][index],
  status: index === 1 ? 'certified' : 'paid',
  submitted_date: ['2026-05-25', '2026-05-20', '2026-06-01'][index],
  certified_date: ['2026-06-08', '2026-06-04', '2026-06-12'][index],
  paid_date: index === 1 ? null : ['2026-06-18', '', '2026-06-20'][index]
}));

const DEMO_QA_QC = DEMO_PROJECTS.map((project, index) => ({
  id: `demo-qa-${index + 1}`,
  project_id: project.id,
  activity_id: DEMO_ACTIVITIES.filter(activity => activity.project_id === project.id)[1].id,
  qa_item: ['Apron subgrade field density test', 'Clarifier wall water-tightness test', 'Basement waterproofing flood test'][index],
  inspection_date: ['2026-06-12', '2026-06-10', '2026-06-16'][index],
  status: index === 1 ? 'failed' as const : 'passed' as const,
  ncr_number: index === 1 ? 'NCR-WTP-014' : null,
  ncr_open_days: index === 1 ? 13 : 0,
  test_result_details: index === 1 ? 'Visible seepage at construction joint; injection repair required.' : 'Accepted against approved ITP.'
}));

const DEMO_SAFETY = DEMO_PROJECTS.map((project, index) => ({
  id: `demo-safety-${index + 1}`,
  project_id: project.id,
  log_date: '2026-06-22',
  toolbox_talks: [4, 3, 5][index],
  incidents: index === 0 ? 1 : 0,
  near_misses: [2, 1, 0][index],
  permits_issued: [7, 6, 8][index],
  environmental_complaints: index === 1 ? 1 : 0
}));

const DEMO_CLAIMS = DEMO_PROJECTS.map((project, index) => ({
  id: `demo-claim-${index + 1}`,
  project_id: project.id,
  type: index === 1 ? 'variation' as const : 'claim_eot' as const,
  reference_id: ['EOT-AIR-02', 'VO-WTP-06', 'EOT-HSP-01'][index],
  title: ['Utility diversion access delay', 'Additional sludge handling system', 'Medical planning approval delay'][index],
  event_date: ['2025-11-30', '2026-02-14', '2026-01-08'][index],
  notice_date: ['2025-12-05', '2026-02-20', '2026-01-13'][index],
  time_impact_days: [20, 35, 23][index],
  cost_impact_amount: [2400000, 11800000, 1750000][index],
  status: index === 1 ? 'negotiating' as const : 'submitted' as const,
  supporting_docs: ['Notice', 'Programme impact', 'Daily records'],
  employer_decision_ref: 'Pending'
}));

const DEMO_RISKS = DEMO_PROJECTS.map((project, index) => ({
  id: `demo-risk-${index + 1}`,
  project_id: project.id,
  wbs_code: '02.01',
  risk_description: ['Live airport utility interface', 'Monsoon turbidity and river access', 'Medical equipment import lead time'][index],
  category: index === 1 ? 'weather' as const : 'procurement' as const,
  probability: [4, 4, 3][index],
  impact: [5, 4, 5][index],
  mitigation_action: ['Night-shift permits and utility scanning', 'Temporary access and raw-water bypass plan', 'Freeze equipment schedule and early approvals'][index],
  status: 'monitoring' as const
}));

const DEMO_DOCUMENTS: DocumentItem[] = DEMO_PROJECTS.flatMap((project, index) => [
  {
    id: `demo-doc-${index + 1}-1`, project_id: project.id, ref_number: `BT-${index + 1}-RFI-014`,
    title: ['RFI — baggage conveyor slab openings', 'RFI — filter nozzle layout', 'RFI — medical gas riser coordination'][index],
    category: 'rfi', version: 'Rev 0', submitted_date: '2026-06-12', action_date: null,
    status: 'under_review', owner: 'Site Engineering Team', remarks: 'Response required before the next work-front release.'
  },
  {
    id: `demo-doc-${index + 1}-2`, project_id: project.id, ref_number: `BT-${index + 1}-SEC-002`,
    title: 'Performance Security and Insurance Register',
    category: 'security', version: 'Rev 1', submitted_date: '2025-09-10', action_date: '2025-09-18',
    status: 'approved', owner: 'Contracts Manager', remarks: 'Validity monitored against current completion date.'
  }
]);

const DEMO_PROCUREMENT: ProcurementOrder[] = [
  {
    id: 'po-air-001', project_id: 'proj-demo-airport', po_number: 'PO-AIR-024', vendor: 'Airport Systems Asia',
    item: 'Baggage handling conveyor package', quantity: 1, unit: 'Pkg', unit_rate: 24500000,
    required_date: '2026-10-15', expected_date: '2026-11-05', delivered_quantity: 0, status: 'ordered'
  },
  {
    id: 'po-water-001', project_id: 'proj-demo-water', po_number: 'PO-WTP-041', vendor: 'HydroMech India',
    item: 'Clarifier scraper mechanisms', quantity: 4, unit: 'No.', unit_rate: 4200000,
    required_date: '2026-07-01', expected_date: '2026-07-22', delivered_quantity: 2, status: 'partially_delivered'
  },
  {
    id: 'po-hosp-001', project_id: 'proj-demo-hospital', po_number: 'PO-HSP-018', vendor: 'Koshi Steel Traders',
    item: 'Fe500 reinforcement steel', quantity: 620, unit: 'Ton', unit_rate: 112000,
    required_date: '2026-06-15', expected_date: '2026-06-20', delivered_quantity: 510, status: 'partially_delivered'
  }
];

const DEMO_STORE_ITEMS: StoreItem[] = DEMO_PROJECTS.flatMap((project, index) => [
  {
    id: `store-${index + 1}-cement`, project_id: project.id, item_code: 'MAT-CEM-001', item_name: 'OPC Cement',
    unit: 'Bag', opening_stock: 1200, received: 3400 + index * 500, issued: 3750 + index * 350,
    reorder_level: 700, location: 'Main covered store'
  },
  {
    id: `store-${index + 1}-diesel`, project_id: project.id, item_code: 'MAT-FUL-001', item_name: 'High Speed Diesel',
    unit: 'Litre', opening_stock: 8500, received: 28000, issued: 31500 - index * 1200,
    reorder_level: 4000, location: 'Bundled fuel yard'
  }
]);

const DEMO_OBLIGATIONS: ContractObligation[] = DEMO_PROJECTS.flatMap((project, index) => [
  {
    id: `obl-${index + 1}-security`, project_id: project.id, reference: 'GCC 4.2',
    title: 'Maintain performance security through completion', category: 'security',
    responsible_party: 'Contracts Manager', due_date: project.target_completion_date,
    status: 'open', evidence: 'Current bank guarantee', notes: 'Extend when EOT changes completion date.'
  },
  {
    id: `obl-${index + 1}-monthly`, project_id: project.id, reference: 'Employer Requirements 6.4',
    title: 'Submit monthly progress report', category: 'reporting',
    responsible_party: 'Planning Engineer', due_date: '2026-06-28',
    status: 'due_soon', evidence: 'Signed monthly report and updated programme', notes: 'Include design, procurement, EHS and cash flow.'
  },
  {
    id: `obl-${index + 1}-insurance`, project_id: project.id, reference: 'GCC 18',
    title: 'Renew contractor all-risk insurance', category: 'insurance',
    responsible_party: 'Commercial Manager', due_date: index === 1 ? '2026-06-18' : '2026-07-15',
    status: index === 1 ? 'overdue' : 'open', evidence: 'Policy endorsement and premium receipt', notes: ''
  }
]);

const DEMO_DAILY_REPORTS = DEMO_PROJECTS.map((project, index) => ({
  id: `demo-report-${index + 1}`,
  project_id: project.id,
  report_date: '2026-06-22',
  weather: index === 1 ? 'Overcast with afternoon rain' : 'Clear / Sunny',
  manpower_total: [86, 112, 74][index],
  equipment_total: [14, 18, 9][index],
  site_instructions: ['Protect live airport utilities before excavation.', 'Repair clarifier construction joint before next lift.', 'Increase basement dewatering watch during night shift.'][index],
  obstruction_reasons: index === 1 ? 'River access road closed for four hours after rainfall.' : '',
  next_day_plan: ['Continue utility trench and duct-bank works.', 'Continue clarifier wall repairs and mechanical embedded items.', 'Complete basement raft pour preparation.'][index],
  submitted_by: 'Demo Site Engineer',
  submitted_at: '2026-06-22T18:15:00Z'
}));

const DEMO_DAILY_EXPENSES: DailyExpense[] = DEMO_PROJECTS.flatMap((project, index) => [
  {
    id: `exp-${index + 1}-fuel`, project_id: project.id, expense_date: '2026-06-22',
    category: 'fuel', description: 'Diesel issued to excavation and generator fleet',
    vendor: 'Nepal Oil Distributor', amount: [285000, 412000, 176000][index],
    payment_method: 'credit', reference: `INV-FUEL-${index + 101}`, wbs_code: '02.01',
    status: 'approved', recorded_by: 'Site Accountant'
  },
  {
    id: `exp-${index + 1}-labour`, project_id: project.id, expense_date: '2026-06-21',
    category: 'labour', description: 'Skilled and unskilled labour payroll advance',
    vendor: 'Direct Labour', amount: [640000, 875000, 520000][index],
    payment_method: 'bank', reference: `PAY-${index + 21}`, wbs_code: '02.01',
    status: 'submitted', recorded_by: 'Site Accountant'
  }
]);

function mergeSeedRows<T extends { id: string }>(key: string, defaults: T[], seeds: T[]) {
  const current = getLocalItem<T[]>(key, defaults);
  const existingIds = new Set(current.map(item => item.id));
  const missing = seeds.filter(item => !existingIds.has(item.id));
  if (missing.length > 0) setLocalItem(key, [...current, ...missing]);
}

function ensureDemoProjects() {
  if (typeof window === 'undefined') return;
  const version = '2026-06-23-v3';
  if (localStorage.getItem('bt_demo_seed_version') === version) return;
  mergeSeedRows('bt_projects_list', [MOCK_PROJECT], DEMO_PROJECTS);
  mergeSeedRows('bt_activities', MOCK_ACTIVITIES, DEMO_ACTIVITIES);
  mergeSeedRows('bt_dependencies', MOCK_DEPENDENCIES, DEMO_DEPENDENCIES);
  mergeSeedRows('bt_design_packages', MOCK_DESIGN_PACKAGES, DEMO_DESIGN_PACKAGES);
  mergeSeedRows('bt_budget_heads', MOCK_BUDGET_HEADS, DEMO_BUDGET_HEADS);
  mergeSeedRows('bt_ipc', MOCK_IPC, DEMO_IPCS);
  mergeSeedRows('bt_ipc_payments', MOCK_IPC_PAYMENTS, []);
  mergeSeedRows('bt_qaqc', MOCK_QA_QC, DEMO_QA_QC);
  mergeSeedRows('bt_safety', MOCK_SAFETY, DEMO_SAFETY);
  mergeSeedRows('bt_variations_claims', MOCK_VARIATIONS_CLAIMS, DEMO_CLAIMS);
  mergeSeedRows('bt_risks', MOCK_RISKS, DEMO_RISKS);
  mergeSeedRows('bt_documents', [], DEMO_DOCUMENTS);
  mergeSeedRows('bt_procurement_orders', [], DEMO_PROCUREMENT);
  mergeSeedRows('bt_store_items', [], DEMO_STORE_ITEMS);
  mergeSeedRows('bt_contract_obligations', [], DEMO_OBLIGATIONS);
  mergeSeedRows('bt_daily_reports', MOCK_DAILY_REPORTS, DEMO_DAILY_REPORTS);
  mergeSeedRows('bt_daily_expenses', [], DEMO_DAILY_EXPENSES);
  localStorage.setItem('bt_demo_seed_version', version);
}

// Helper functions for localstorage IO
function getLocalItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  if (!stored) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(stored) as T;
  } catch (e) {
    return defaultValue;
  }
}

const PERSISTENT_LOCAL_KEYS = new Set(['bt_supabase_url', 'bt_supabase_anon_key', 'bt_durable_mutations', 'bt_durable_tombstones']);

function clearWorkspaceCache() {
  if (typeof window === 'undefined') return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = null;
  pendingCloudSyncKeys.clear();
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith('bt_')) && !PERSISTENT_LOCAL_KEYS.has(key!));
  keys.forEach(key => localStorage.removeItem(key));
}

const CLOUD_SYNC_KEYS = new Set([
  'bt_projects_list', 'bt_wbs', 'bt_activities', 'bt_dependencies', 'bt_design_packages',
  'bt_design_comments',
  'bt_daily_reports', 'bt_daily_work_items', 'bt_material_logs', 'bt_budget_heads',
  'bt_subcontractors', 'bt_ipc', 'bt_ipc_payments', 'bt_qaqc', 'bt_safety', 'bt_variations_claims',
  'bt_risks', 'bt_handover', 'bt_defects', 'bt_finance_rows', 'bt_documents',
  'bt_procurement_orders', 'bt_store_items', 'bt_contract_obligations',
  'bt_daily_expenses', 'bt_daily_resource_usage', 'bt_employee_visits', 'bt_employees',
  'bt_uploaded_documents', 'bt_inventory_events', 'bt_notifications'
]);
let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
let cloudPullInProgress = false;
const pendingCloudSyncKeys = new Set<string>();
const durableMutations = new DurableMutationOutbox();
const CLOUD_SYNC_ORDER = [
  'bt_projects_list', 'bt_wbs', 'bt_activities', 'bt_dependencies', 'bt_design_packages',
  'bt_design_comments', 'bt_daily_reports', 'bt_daily_work_items', 'bt_material_logs',
  'bt_budget_heads', 'bt_subcontractors', 'bt_ipc', 'bt_ipc_payments', 'bt_qaqc', 'bt_safety',
  'bt_variations_claims', 'bt_risks', 'bt_handover', 'bt_defects', 'bt_finance_rows',
  'bt_documents', 'bt_procurement_orders', 'bt_store_items', 'bt_contract_obligations',
  'bt_daily_expenses', 'bt_daily_resource_usage', 'bt_employee_visits', 'bt_employees',
  'bt_uploaded_documents', 'bt_inventory_events', 'bt_notifications'
];

const SYNC_LABELS: Record<string, { module: string; action: string }> = {
  bt_projects_list: { module: 'Projects', action: 'Project list updated' },
  bt_wbs: { module: 'Schedule', action: 'BOQ/WBS updated' },
  bt_activities: { module: 'Schedule', action: 'Work programme updated' },
  bt_dependencies: { module: 'Schedule', action: 'Relationship logic updated' },
  bt_daily_reports: { module: 'Daily Site Reporting', action: 'Daily report saved' },
  bt_daily_work_items: { module: 'Daily Site Reporting', action: 'Completed work updated' },
  bt_material_logs: { module: 'Daily Site Reporting', action: 'Material log updated' },
  bt_daily_expenses: { module: 'Finance', action: 'Daily expense updated' },
  bt_ipc: { module: 'Finance', action: 'IPC record updated' },
  bt_ipc_payments: { module: 'Finance', action: 'IPC payment recorded' },
  bt_daily_resource_usage: { module: 'Resources', action: 'Resource usage updated' },
  bt_employee_visits: { module: 'Employees', action: 'Site visit updated' },
  bt_employees: { module: 'Employees', action: 'Employee record updated' },
  bt_procurement_orders: { module: 'Procurement', action: 'Procurement record updated' },
  bt_store_items: { module: 'Inventory', action: 'Store inventory updated' },
  bt_inventory_events: { module: 'Inventory', action: 'Inventory log updated' },
  bt_contract_obligations: { module: 'Contracts', action: 'Contract obligation updated' },
  bt_uploaded_documents: { module: 'Documents', action: 'Document uploaded' },
  bt_notifications: { module: 'Notifications', action: 'Notification updated' },
};

function appendNotification(key: string) {
  if (typeof window === 'undefined' || cloudPullInProgress || key === 'bt_notifications') return;
  const label = SYNC_LABELS[key];
  if (!label) return;
  const projectId = getActiveProjectId();
  const auth = getLocalItem<{ name?: string } | null>('bt_auth_user', null);
  const rows = getLocalItem<AppNotification[]>('bt_notifications', []);
  const last = rows[0];
  const now = new Date().toISOString();
  if (last && last.project_id === projectId && last.action === label.action && Date.now() - new Date(last.created_at).getTime() < 1500) return;
  const next: AppNotification = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    project_id: projectId,
    actor: auth?.name || 'BuildTrack User',
    action: label.action,
    module: label.module,
    detail: `${label.module} changed in ${storage.getProject()?.name || 'active project'}.`,
    created_at: now,
    read: false,
  };
  localStorage.setItem('bt_notifications', JSON.stringify([next, ...rows].slice(0, 200)));
  scheduleCloudSync('bt_notifications');
}

function scheduleCloudSync(key: string) {
  if (typeof window === 'undefined' || cloudPullInProgress || !CLOUD_SYNC_KEYS.has(key) || !isSupabaseConfigured()) return;
  const projectId = getActiveProjectId();
  // Daily reports are synchronized through their durable operation so retries
  // retain the original record identity and never create duplicate reports.
  if (key === 'bt_daily_reports' && durableMutations.pendingForProject(projectId).some(item => item.kind === 'daily_work_update' || item.kind === 'daily_report_delete')) return;
  storage.enqueueProjectCollectionMutation(key, projectId);
  pendingCloudSyncKeys.add(`${projectId}:${key}`);
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    const activeProjectId = getActiveProjectId();
    [...pendingCloudSyncKeys].filter(item => item.startsWith(`${activeProjectId}:`)).forEach(item => pendingCloudSyncKeys.delete(item));
    void storage.flushDurableMutations(activeProjectId);
  }, 500);
}

function setLocalItem<T>(key: string, value: T): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
    appendNotification(key);
    scheduleCloudSync(key);
  }
}

type CloudSyncResult = { ok: true } | { ok: false; message: string };

async function upsertCloudRow(table: string, row: Record<string, unknown>): Promise<CloudSyncResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: 'Supabase is not configured.' };
  const { data: { session } } = await client.auth.getSession();
  if (!session) return { ok: false, message: 'Sign in to Supabase before synchronizing.' };
  const { error } = await client.from(table).upsert(row, { onConflict: 'id' });
  if (error) {
    console.warn(`BuildTrack cloud sync skipped for ${table}:`, error.message);
    return { ok: false, message: `${table}: ${error.message}` };
  }
  return { ok: true };
}

async function upsertCloudRows(table: string, rows: Record<string, unknown>[]): Promise<CloudSyncResult> {
  if (rows.length === 0) return { ok: true };
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: 'Supabase is not configured.' };
  const { data: { session } } = await client.auth.getSession();
  if (!session) return { ok: false, message: 'Sign in to Supabase before synchronizing.' };
  const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
  if (error) {
    console.warn(`BuildTrack cloud sync skipped for ${table}:`, error.message);
    return { ok: false, message: `${table}: ${error.message}` };
  }
  return { ok: true };
}

async function upsertProjectUser(row: Record<string, unknown>) {
  const client = getSupabaseClient();
  if (!client) return;
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  const { error } = await client.from('project_users').upsert(row, { onConflict: 'project_id,email' });
  if (error) console.warn('BuildTrack personnel sync skipped:', error.message);
}

async function syncLocalKeyToCloud(key: string): Promise<CloudSyncResult> {
  const projectId = getActiveProjectId();
  const reports = getLocalItem<any[]>('bt_daily_reports', []).filter(item => item.project_id === projectId);
  const reportIds = new Set(reports.map(item => item.id));
  const simpleMappings: Record<string, [string, string]> = {
    bt_wbs: ['wbs_items', 'bt_wbs'],
    bt_dependencies: ['activity_dependencies', 'bt_dependencies'],
    bt_design_packages: ['design_packages', 'bt_design_packages'],
    bt_design_comments: ['design_comments', 'bt_design_comments'],
    bt_daily_reports: ['daily_reports', 'bt_daily_reports'],
    bt_budget_heads: ['budget_heads', 'bt_budget_heads'],
    bt_subcontractors: ['subcontractor_packages', 'bt_subcontractors'],
    bt_ipc: ['ipc_submissions', 'bt_ipc'],
    bt_ipc_payments: ['ipc_payments', 'bt_ipc_payments'],
    bt_qaqc: ['qa_qc_inspections', 'bt_qaqc'],
    bt_safety: ['safety_logs', 'bt_safety'],
    bt_variations_claims: ['variations_and_claims', 'bt_variations_claims'],
    bt_risks: ['risk_register', 'bt_risks'],
    bt_handover: ['handover_checklists', 'bt_handover'],
    bt_defects: ['defects_liability', 'bt_defects'],
    bt_documents: ['document_register', 'bt_documents'],
    bt_procurement_orders: ['procurement_orders', 'bt_procurement_orders'],
    bt_store_items: ['store_items', 'bt_store_items'],
    bt_contract_obligations: ['contract_obligations', 'bt_contract_obligations'],
    bt_daily_expenses: ['daily_expenses', 'bt_daily_expenses'],
    bt_daily_resource_usage: ['daily_resource_usage', 'bt_daily_resource_usage'],
    bt_employee_visits: ['employee_visits', 'bt_employee_visits'],
    bt_employees: ['employee_profiles', 'bt_employees'],
    bt_uploaded_documents: ['uploaded_documents', 'bt_uploaded_documents'],
    bt_inventory_events: ['inventory_events', 'bt_inventory_events'],
    bt_notifications: ['app_notifications', 'bt_notifications']
  };
  if (key === 'bt_projects_list') {
    const project = getLocalItem<any[]>('bt_projects_list', []).find(item => item.id === projectId);
    return project ? upsertCloudRow('projects', project) : { ok: true };
  }
  if (key === 'bt_activities') {
    const rows = getLocalItem<(Activity & { project_id?: string })[]>('bt_activities', [])
      .filter(item => item.project_id === projectId)
      .map(({ early_start, early_finish, late_start, late_finish, total_float, free_float, is_critical, is_near_critical, ...item }) => item);
    return upsertCloudRows('activities', rows as unknown as Record<string, unknown>[]);
  }
  if (key === 'bt_daily_work_items' || key === 'bt_material_logs') {
    const [table, localKey] = key === 'bt_daily_work_items'
      ? ['daily_work_items', 'bt_daily_work_items']
      : ['material_logs', 'bt_material_logs'];
    const rows = getLocalItem<Record<string, unknown>[]>(localKey, [])
      .filter(item => reportIds.has(String(item.daily_report_id)))
      .map(item => ({ ...item, project_id: projectId }));
    return upsertCloudRows(table, rows);
  }
  if (key === 'bt_finance_rows') {
    const finance = getLocalItem<Record<string, FinanceRow[]>>('bt_finance_rows', {});
    return upsertCloudRows('finance_rows', (finance[projectId] || []).map(row => ({
      id: row.id, project_id: projectId, row_key: row.id, name: row.name,
      category: row.category, monthly_values: row.values
    })));
  }
  const mapping = simpleMappings[key];
  if (!mapping) return { ok: false, message: `No cloud mapping is defined for ${key}.` };
  const [table, localKey] = mapping;
  const rows = getLocalItem<Record<string, unknown>[]>(localKey, [])
    .filter(item => item.project_id === projectId)
    .map(item => ({ ...item, project_id: projectId }));
  return upsertCloudRows(table, rows);
}

function cloudPullMappings(): Array<[string, string]> {
  return [
    ['wbs_items', 'bt_wbs'],
    ['activities', 'bt_activities'],
    ['activity_dependencies', 'bt_dependencies'],
    ['design_packages', 'bt_design_packages'],
    ['design_comments', 'bt_design_comments'],
    ['daily_reports', 'bt_daily_reports'],
    ['daily_work_items', 'bt_daily_work_items'],
    ['material_logs', 'bt_material_logs'],
    ['budget_heads', 'bt_budget_heads'],
    ['subcontractor_packages', 'bt_subcontractors'],
    ['ipc_submissions', 'bt_ipc'],
    ['ipc_payments', 'bt_ipc_payments'],
    ['qa_qc_inspections', 'bt_qaqc'],
    ['safety_logs', 'bt_safety'],
    ['variations_and_claims', 'bt_variations_claims'],
    ['risk_register', 'bt_risks'],
    ['handover_checklists', 'bt_handover'],
    ['defects_liability', 'bt_defects'],
    ['document_register', 'bt_documents'],
    ['procurement_orders', 'bt_procurement_orders'],
    ['store_items', 'bt_store_items'],
    ['contract_obligations', 'bt_contract_obligations'],
    ['daily_expenses', 'bt_daily_expenses'],
    ['daily_resource_usage', 'bt_daily_resource_usage'],
    ['employee_visits', 'bt_employee_visits'],
    ['employee_profiles', 'bt_employees'],
    ['uploaded_documents', 'bt_uploaded_documents'],
    ['inventory_events', 'bt_inventory_events'],
    ['app_notifications', 'bt_notifications'],
    ['site_photos', 'bt_site_photos'],
  ];
}

async function pullProjectSetFromCloud(projectIds: string[], replaceWorkspace: boolean) {
  const client = getSupabaseClient();
  if (!client || projectIds.length === 0) return { ok: false, message: 'No cloud projects are available.' };
  const { data: { session } } = await client.auth.getSession();
  if (!session) return { ok: false, message: 'Sign in before loading the shared workspace.' };

  const mappings = cloudPullMappings();
  cloudPullInProgress = true;
  try {
    const results = await Promise.all([
      client.from('projects').select('*').in('id', projectIds),
      client.from('project_users').select('id,project_id,auth_user_id,email,name,role,feature_permissions').in('project_id', projectIds),
      client.from('finance_rows').select('*').in('project_id', projectIds),
      ...mappings.map(([table]) => client.from(table).select('*').in('project_id', projectIds)),
    ]);
    const projectResult = results[0];
    const membershipResult = results[1];
    const financeResult = results[2];
    const tableResults = results.slice(3);

    if (projectResult.error) return { ok: false, message: projectResult.error.message };
    if (membershipResult.error) return { ok: false, message: membershipResult.error.message };

    if (projectResult.data) {
      const previous = replaceWorkspace ? [] : getLocalItem<Record<string, unknown>[]>('bt_projects_list', []);
      const remaining = previous.filter(item => !projectIds.includes(String(item.id)));
      localStorage.setItem('bt_projects_list', JSON.stringify([...remaining, ...projectResult.data]));
    }
    if (membershipResult.data) localStorage.setItem('bt_users', JSON.stringify(membershipResult.data));

    tableResults.forEach((result, index) => {
      const [table, key] = mappings[index];
      if (result.error) {
        console.warn(`BuildTrack cloud pull skipped ${table}:`, result.error.message);
        return;
      }
      // Never replace a project collection while that project has an
      // unacknowledged local mutation touching it. It will be pulled after the
      // outbox confirms replay, rather than silently losing local work.
      if (projectIds.some(projectId => durableMutations.protectedLocalKeys(projectId).has(key))) return;
      const previous = replaceWorkspace ? [] : getLocalItem<Record<string, unknown>[]>(key, []);
      const remaining = previous.filter(row => !projectIds.includes(String(row.project_id)));
      localStorage.setItem(key, JSON.stringify([...remaining, ...(result.data || [])]));
    });

    if (!financeResult.error) {
      const previous = replaceWorkspace ? {} : getLocalItem<Record<string, FinanceRow[]>>('bt_finance_rows', {});
      projectIds.forEach(projectId => {
        previous[projectId] = (financeResult.data || [])
          .filter(row => row.project_id === projectId)
          .map(row => ({ id: row.row_key, name: row.name, category: row.category, values: row.monthly_values }));
      });
      localStorage.setItem('bt_finance_rows', JSON.stringify(previous));
    }
    localStorage.setItem('bt_last_cloud_sync', new Date().toISOString());
    return { ok: true, message: `Loaded ${projectResult.data?.length || 0} shared project(s).` };
  } finally {
    cloudPullInProgress = false;
  }
}

// Helper: Active Project Management
const getActiveProjectId = () => {
  return getLocalItem('bt_active_project_id', 'proj-101');
};

export const storage = {
  // Supabase runtime connection config keys
  setSupabaseConfig: (url: string, key: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bt_supabase_url', url);
      localStorage.setItem('bt_supabase_anon_key', key);
      cachedSupabaseClient = null;
      cachedSupabaseConfig = '';
    }
  },

  getSupabaseConfig: () => {
    if (typeof window === 'undefined') return { url: '', key: '' };
    return {
      url: localStorage.getItem('bt_supabase_url') || defaultUrl,
      key: localStorage.getItem('bt_supabase_anon_key') || defaultAnonKey
    };
  },

  isSupabaseConfigured,

  clearWorkspaceCache,

  getAuthSession: async () => {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session;
  },

  getCurrentAuthUser: async () => {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return null;
    const { data: memberships } = await client
      .from('project_users')
      .select('id,project_id,auth_user_id,name,email,role,feature_permissions')
      .eq('auth_user_id', session.user.id)
      .order('created_at', { ascending: true });
    if (!memberships?.length) {
      const { data: platformAdmin } = await client
        .from('platform_admins')
        .select('auth_user_id,email,name')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      return platformAdmin
        ? { name: platformAdmin.name, email: platformAdmin.email, role: 'super_admin' }
        : null;
    }
    localStorage.setItem('bt_project_memberships', JSON.stringify(memberships));
    const activeProjectId = localStorage.getItem('bt_active_project_id');
    const profile = memberships.find(item => item.project_id === activeProjectId) || memberships[0];
    return { name: profile.name, email: profile.email, role: profile.role, feature_permissions: profile.feature_permissions || null };
  },

  getVerifiedLocalDemoUser,

  getProjectMemberships: (): ProjectMembership[] => {
    if (typeof window === 'undefined') return [];
    return getLocalItem<ProjectMembership[]>('bt_project_memberships', []);
  },

  getMembershipForProject: (projectId: string) => {
    return storage.getProjectMemberships().find(item => item.project_id === projectId) || null;
  },

  bootstrapCloudWorkspace: async () => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Cloud workspace is not configured.' };
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { ok: false, message: 'No cloud session is active.' };
    const { data: memberships, error } = await client
      .from('project_users')
      .select('id,project_id,auth_user_id,email,name,role,feature_permissions,created_at')
      .eq('auth_user_id', session.user.id)
      .order('created_at', { ascending: true });
    if (error) return { ok: false, message: error.message };
    if (!memberships?.length) {
      const { data: platformAdmin } = await client
        .from('platform_admins')
        .select('auth_user_id,email,name')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (!platformAdmin) return { ok: false, message: 'This account has not been assigned to a business or project.' };
      clearWorkspaceCache();
      return {
        ok: true,
        message: 'Platform administration workspace loaded.',
        user: { name: platformAdmin.name, email: platformAdmin.email, role: 'super_admin' },
        projectIds: [] as string[],
      };
    }

    const projectIds = [...new Set(memberships.map(item => String(item.project_id)))];
    const current = getActiveProjectId();
    const activeProjectId = projectIds.includes(current) ? current : projectIds[0];
    localStorage.setItem('bt_project_memberships', JSON.stringify(memberships));
    localStorage.setItem('bt_active_project_id', activeProjectId);
    const pulled = await pullProjectSetFromCloud(projectIds, true);
    if (!pulled.ok) return pulled;
    const profile = memberships.find(item => item.project_id === activeProjectId) || memberships[0];
    return {
      ok: true,
      message: pulled.message,
      user: { name: profile.name, email: profile.email, role: profile.role, feature_permissions: profile.feature_permissions || null },
      projectIds,
    };
  },

  signUp: async (email: string, password: string, metadata: { name: string; role: string }) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Account creation requires the managed cloud workspace.');
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: metadata }
      });
      if (error) throw error;
      return { local: false, user: data.user, session: data.session };
    } catch (error) {
      if (isNetworkLikeError(error)) throw new Error('Account creation is temporarily unavailable. Please try again when the cloud workspace is reachable.');
      throw error;
    }
  },

  signIn: async (email: string, password: string) => {
    const loginEmail = resolveLoginIdentifier(email);
    const client = getSupabaseClient();
    if (!client) {
      return signInWithLocalFallback(loginEmail, password);
    }
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      const { data: profile } = await client
        .from('project_users')
        .select('id,project_id,auth_user_id,name,email,role,feature_permissions')
        .eq('auth_user_id', data.user.id)
        .limit(1)
        .maybeSingle();
      if (!profile) {
        const { data: platformAdmin } = await client
          .from('platform_admins')
          .select('auth_user_id,email,name')
          .eq('auth_user_id', data.user.id)
          .maybeSingle();
        if (platformAdmin) {
          return {
            local: false,
            user: { name: platformAdmin.name, email: platformAdmin.email, role: 'super_admin' },
            session: data.session,
          };
        }
        await client.auth.signOut();
        throw new Error('This account is not assigned to a business or project yet. Ask your Director or Business Admin to grant access.');
      }
      return {
        local: false,
        user: { name: profile.name, email: profile.email, role: profile.role, feature_permissions: profile.feature_permissions || null },
        session: data.session
      };
    } catch (error) {
      if (LOCAL_DEMO_EMAILS.has(loginEmail)) return signInWithLocalFallback(loginEmail, password);
      if (error instanceof Error) throw error;
      throw new Error(isNetworkLikeError(error) ? 'The cloud workspace is temporarily unreachable.' : 'Sign-in failed.');
    }
  },

  signInWithGoogle: async () => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Connect Supabase before using Google sign-in.');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  },

  requestPasswordReset: async (email: string) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Password recovery requires the managed cloud workspace.');
    const normalizedEmail = resolveLoginIdentifier(email.trim());
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error('Enter the email address assigned to your BuildTrack account.');
    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
    return { ok: true };
  },

  updatePassword: async (password: string) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Password recovery requires the managed cloud workspace.');
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new Error('Use at least 10 characters with upper-case, lower-case and a number.');
    }
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('This recovery link is invalid or expired. Request a new one from the sign-in page.');
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    await client.auth.signOut();
    return { ok: true };
  },

  signOut: async () => {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
    await fetch('/api/auth/local', { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    clearWorkspaceCache();
  },

  onAuthStateChange: (callback: (user: { name: string; email: string; role: string; feature_permissions?: FeaturePermissions | null } | null) => void) => {
    const client = getSupabaseClient();
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }
      window.setTimeout(() => {
        void client
          .from('project_users')
          .select('name,email,role,feature_permissions')
          .eq('auth_user_id', session.user.id)
          .limit(1)
          .maybeSingle()
          .then(async ({ data: profile }) => {
            if (profile) {
              callback({ name: profile.name, email: profile.email, role: profile.role, feature_permissions: profile.feature_permissions || null });
              return;
            }
            const { data: platformAdmin } = await client
              .from('platform_admins')
              .select('auth_user_id,email,name')
              .eq('auth_user_id', session.user.id)
              .maybeSingle();
            callback(platformAdmin ? { name: platformAdmin.name, email: platformAdmin.email, role: 'super_admin' } : null);
          });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  },

  testSupabaseConnection: async () => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Enter a valid Supabase URL and anon key.' };
    const { error: sessionError } = await client.auth.getSession();
    if (sessionError) return { ok: false, message: sessionError.message };
    const { error: schemaError } = await client.from('projects').select('id').limit(1);
    if (schemaError) {
      const missingSchema = schemaError.message.includes('projects') || schemaError.code === '42P01' || schemaError.code === 'PGRST205';
      return {
        ok: false,
        message: missingSchema
          ? 'Connected to Supabase, but the BuildTrack schema is missing. Run supabase_schema.sql in the Supabase SQL Editor first.'
          : `Supabase schema check failed: ${schemaError.message}`
      };
    }
    const { error: bucketError } = await client.storage.from('site-photos').list('', { limit: 1 });
    const hasPhotoBucket = !bucketError;
    return {
      ok: true,
      message: hasPhotoBucket
        ? 'Supabase schema and private site-photos bucket are ready. Sign in to synchronize protected project data.'
        : 'Database schema is ready, but the site-photos bucket could not be verified. Re-run the storage section of supabase_schema.sql.'
    };
  },

  ensureActiveProjectMembership: async (user: { name: string; email: string; role: string }) => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Supabase is not configured.' };
    const session = await storage.getAuthSession();
    if (!session) return { ok: false, message: 'Confirm your email and sign in before cloud setup.' };
    const { data: membership, error } = await client
      .from('project_users')
      .select('id')
      .eq('project_id', getActiveProjectId())
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    return membership
      ? { ok: true, message: 'Project membership is verified.' }
      : { ok: false, message: `${user.email} has not been assigned to this project.` };
  },

  syncUserToSupabase: async (user: { name: string; email: string; role: string }) => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, skipped: true };
    const session = await storage.getAuthSession();
    if (!session) return { ok: false, error: 'Authentication is required.' };
    const { data, error } = await client
      .from('project_users')
      .select('id')
      .eq('project_id', getActiveProjectId())
      .eq('auth_user_id', session.user.id)
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    return { ok: Boolean(data) && !error, error: error?.message || (!data ? 'Membership must be assigned by a Director or Business Admin.' : undefined) };
  },

  resetDatabase: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('bt_projects_list');
    localStorage.removeItem('bt_active_project_id');
    localStorage.removeItem('bt_users');
    localStorage.removeItem('bt_wbs');
    localStorage.removeItem('bt_activities');
    localStorage.removeItem('bt_dependencies');
    localStorage.removeItem('bt_design_packages');
    localStorage.removeItem('bt_daily_reports');
    localStorage.removeItem('bt_daily_work_items');
    localStorage.removeItem('bt_material_logs');
    localStorage.removeItem('bt_budget_heads');
    localStorage.removeItem('bt_subcontractors');
    localStorage.removeItem('bt_ipc');
    localStorage.removeItem('bt_ipc_payments');
    localStorage.removeItem('bt_qaqc');
    localStorage.removeItem('bt_safety');
    localStorage.removeItem('bt_variations_claims');
    localStorage.removeItem('bt_risks');
    localStorage.removeItem('bt_handover');
    localStorage.removeItem('bt_defects');
    localStorage.removeItem('bt_documents');
    localStorage.removeItem('bt_finance_rows');
    localStorage.removeItem('bt_demo_seed_version');
    localStorage.removeItem('bt_procurement_orders');
    localStorage.removeItem('bt_store_items');
    localStorage.removeItem('bt_contract_obligations');
    localStorage.removeItem('bt_site_photos');
    localStorage.removeItem('bt_daily_expenses');
    localStorage.removeItem('bt_daily_resource_usage');
    localStorage.removeItem('bt_employee_visits');
    localStorage.removeItem('bt_employees');
    localStorage.removeItem('bt_uploaded_documents');
    localStorage.removeItem('bt_inventory_events');
    localStorage.removeItem('bt_notifications');
    localStorage.removeItem('bt_supabase_url');
    localStorage.removeItem('bt_supabase_anon_key');
    storage.getProjectsList();
  },

  // Projects list
  getProjectsList: (): any[] => {
    ensureDemoProjects();
    return getLocalItem('bt_projects_list', [MOCK_PROJECT, ...DEMO_PROJECTS]);
  },

  createProject: async (name: string, contractAmount: number, startDate: string, duration: number) => {
    const list = storage.getProjectsList();
    const sourceProjectId = getActiveProjectId();
    const sourceProject = list.find(project => project.id === sourceProjectId);
    const targetDate = addDays(startDate, duration);
    const newProject = {
      id: `proj-${crypto.randomUUID()}`,
      name,
      contract_number: `CONT-${Math.floor(Math.random() * 900) + 100}`,
      contract_amount: contractAmount,
      currency: 'NPR',
      start_date: startDate,
      contract_duration_days: duration,
      target_completion_date: targetDate,
      jv_status: 'solo' as const,
      lead_partner: sourceProject?.lead_partner || 'Lead Partner Admin',
      organization_id: sourceProject?.organization_id,
      organization_name: sourceProject?.organization_name || sourceProject?.lead_partner,
      status: 'active',
    };

    const client = getSupabaseClient();
    const session = client ? await storage.getAuthSession() : null;
    if (client && session) {
      const { data: sourceMembership, error: membershipError } = await client
        .from('project_users')
        .select('name,email,role,feature_permissions')
        .eq('project_id', sourceProjectId)
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (membershipError) throw new Error(membershipError.message);
      if (!sourceMembership || !['project_director', 'business_admin'].includes(sourceMembership.role)) {
        throw new Error('Only a Director or Business Admin can create a project for this business.');
      }
      const { error: projectError } = await client.from('projects').insert({ ...newProject, created_by: session.user.id });
      if (projectError) throw new Error(`Project creation failed: ${projectError.message}`);
      const { error: directoryError } = await client.from('project_users').insert({
        id: `${newProject.id}-${session.user.id}`,
        auth_user_id: session.user.id,
        project_id: newProject.id,
        email: sourceMembership.email,
        name: sourceMembership.name,
        role: sourceMembership.role,
        feature_permissions: sourceMembership.feature_permissions || {},
      });
      if (directoryError) {
        await client.from('projects').delete().eq('id', newProject.id);
        throw new Error(`Project membership failed: ${directoryError.message}`);
      }
      const memberships = storage.getProjectMemberships();
      localStorage.setItem('bt_project_memberships', JSON.stringify([
        ...memberships,
        { id: `${newProject.id}-${session.user.id}`, auth_user_id: session.user.id, project_id: newProject.id, ...sourceMembership },
      ]));
    }
    list.push(newProject);
    setLocalItem('bt_projects_list', list);
    storage.setActiveProjectId(newProject.id);
    return newProject;
  },

  getActiveProjectId,

  getDurableMutationScope: (projectId = getActiveProjectId()) => {
    const project = storage.getProjectsList().find(item => item.id === projectId);
    const membership = storage.getMembershipForProject(projectId);
    const auth = getLocalItem<{ id?: string; email?: string } | null>('bt_auth_user', null);
    return {
      projectId,
      organizationId: String(project?.organization_id || project?.organization_name || 'unassigned'),
      actorId: String(membership?.auth_user_id || auth?.id || membership?.email || auth?.email || 'unknown'),
    };
  },

  enqueueDailyWorkMutation: (input: { projectId: string; report: Record<string, unknown>; workItems: Array<Record<string, unknown>>; materialItems: Array<Record<string, unknown>>; operationId?: string }) => {
    const scope = storage.getDurableMutationScope(input.projectId);
    const targetId = String(input.report.id || input.operationId || createMutationId('daily'));
    return durableMutations.enqueue({
      // A retry keeps the caller-provided operation id. A later edit to the
      // same report receives a different operation so an acknowledged save
      // cannot suppress a legitimate follow-up change.
      id: input.operationId || `daily-work-${scope.projectId}-${createMutationId('op')}`,
      kind: 'daily_work_update', ...scope, targetId,
      affectedLocalKeys: ['bt_daily_reports', 'bt_daily_work_items', 'bt_material_logs', 'bt_activities'],
      payload: { report: { ...input.report, id: targetId }, expectedRevision: Number(input.report.revision || 0), workItems: input.workItems, materialItems: input.materialItems },
    });
  },

  enqueueDailyReportDeletion: (reportId: string, projectId = getActiveProjectId()) => {
    const scope = storage.getDurableMutationScope(projectId);
    return durableMutations.enqueue({
      id: `daily-delete-${scope.projectId}-${reportId}`,
      kind: 'daily_report_delete', ...scope, targetId: reportId,
      affectedLocalKeys: ['bt_daily_reports', 'bt_daily_work_items', 'bt_material_logs', 'bt_activities'],
      payload: { reportId }, tombstone: { localKey: 'bt_daily_reports', recordId: reportId },
    });
  },

  enqueueProjectCollectionMutation: (localKey: string, projectId = getActiveProjectId()) => {
    const scope = storage.getDurableMutationScope(projectId);
    return durableMutations.enqueue({
      // Collection writes are coalesced by the short scheduler window, not by
      // a permanently reused id. Reusing an acknowledged id would make all
      // future edits to this collection invisible to the outbox.
      id: `collection-sync-${scope.projectId}-${localKey}-${createMutationId('op')}`,
      kind: 'project_collection_sync', ...scope, targetId: localKey,
      affectedLocalKeys: [localKey], payload: { localKey },
    });
  },

  enqueueProjectRecordDeletion: (input: { table: string; localKey: string; recordId: string; projectId?: string }) => {
    const projectId = input.projectId || getActiveProjectId();
    const scope = storage.getDurableMutationScope(projectId);
    return durableMutations.enqueue({
      id: `record-delete-${scope.projectId}-${input.table}-${input.recordId}`,
      kind: 'project_record_delete', ...scope, targetId: input.recordId,
      affectedLocalKeys: [input.localKey],
      payload: { table: input.table, localKey: input.localKey, recordId: input.recordId },
      tombstone: { localKey: input.localKey, recordId: input.recordId },
    });
  },

  // Includes conflict entries: they are not server-confirmed and must remain
  // visible/recoverable rather than disappearing from the application shell.
  getPendingDurableMutations: (projectId = getActiveProjectId()) => durableMutations.unacknowledgedForProject(projectId),

  getDurableSyncSummary: (projectId = getActiveProjectId()) => {
    const scope = storage.getDurableMutationScope(projectId);
    return durableMutations.summaryForProject(projectId, scope.actorId);
  },

  flushDurableMutations: async (projectId = getActiveProjectId()) => {
    const scope = storage.getDurableMutationScope(projectId);
    if (getActiveProjectId() !== projectId) return { ok: false, message: 'Pending changes belong to another project and were not replayed.' };
    const pending = durableMutations.pendingForProject(projectId, scope.actorId);
    const ready: typeof pending = [];
    for (const mutation of pending) {
      if (mutation.organizationId !== scope.organizationId) {
        durableMutations.markConflict(mutation.id, 'Tenant context changed before this pending update could be synchronized.');
        continue;
      }
      if (mutation.kind === 'daily_work_update') {
        const payload = mutation.payload as { report?: Record<string, unknown>; workItems?: Array<Record<string, unknown>>; materialItems?: Array<Record<string, unknown>> };
        if (!payload.report?.id) {
          durableMutations.markConflict(mutation.id, 'The pending daily update has no stable report identity.');
          continue;
        }
        if (!storage.getDailyReports().some(report => report.id === payload.report?.id)) storage.submitDailyReport(payload.report, payload.workItems || [], payload.materialItems || []);
      }
      ready.push(mutation);
    }
    for (const mutation of ready) {
      if (getActiveProjectId() !== mutation.projectId) {
        durableMutations.markConflict(mutation.id, 'Active project changed before this pending update could be synchronized.');
        continue;
      }
      let sync: CloudSyncResult = { ok: true };
      if (mutation.kind === 'daily_work_update') {
        // The stable report ID and Supabase upserts make retries idempotent.
        // Keep the mutation unacknowledged until every related row has a
        // positive cloud response; no local state is claimed as confirmed.
        for (const key of ['bt_daily_reports', 'bt_daily_work_items', 'bt_material_logs', 'bt_activities']) {
          sync = await syncLocalKeyToCloud(key);
          if (!sync.ok) break;
        }
      } else if (mutation.kind === 'project_collection_sync') {
        const localKey = String(mutation.payload.localKey || mutation.targetId);
        sync = await syncLocalKeyToCloud(localKey);
      } else if (mutation.kind === 'daily_report_delete') {
        const client = getSupabaseClient();
        if (!client) sync = { ok: false, message: 'Supabase is not configured.' };
        else {
          const { error } = await client.from('daily_reports').delete().eq('id', mutation.targetId).eq('project_id', mutation.projectId);
          sync = error ? { ok: false, message: `daily_reports: ${error.message}` } : { ok: true };
        }
      } else if (mutation.kind === 'project_record_delete') {
        const table = String(mutation.payload.table || '');
        const recordId = String(mutation.payload.recordId || mutation.targetId);
        const client = getSupabaseClient();
        if (!table || !recordId) sync = { ok: false, message: 'The pending deletion does not identify a cloud record.' };
        else if (!client) sync = { ok: false, message: 'Supabase is not configured.' };
        else {
          const { error } = await client.from(table).delete().eq('id', recordId).eq('project_id', mutation.projectId);
          sync = error ? { ok: false, message: `${table}: ${error.message}` } : { ok: true };
        }
      }
      if (sync.ok) durableMutations.acknowledge(mutation.id);
      else durableMutations.markFailed(mutation.id, sync.message || 'Cloud confirmation was not received.');
    }
    const remaining = durableMutations.unacknowledgedForProject(projectId, scope.actorId);
    return remaining.length ? { ok: false, message: remaining[0].lastError || 'Some changes are still pending cloud confirmation.' } : { ok: true, message: 'Pending changes synchronized.' };
  },
  
  setActiveProjectId: (id: string) => {
    setLocalItem('bt_active_project_id', id);
  },

  getProject: () => {
    const id = getActiveProjectId();
    const list = storage.getProjectsList();
    return list.find(p => p.id === id) || MOCK_PROJECT;
  },

  updateProject: (proj: any) => {
    const list = storage.getProjectsList();
    const idx = list.findIndex(p => p.id === proj.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...proj };
      setLocalItem('bt_projects_list', list);
      storage.recalculateSchedule();
    }
  },

  archiveProject: async (projectId: string) => {
    const client = getSupabaseClient();
    const session = client ? await storage.getAuthSession() : null;
    if (client && session) {
      const { error } = await client.from('projects').update({ status: 'archived' }).eq('id', projectId);
      if (error) throw new Error(error.message);
    }
    const list = storage.getProjectsList();
    setLocalItem('bt_projects_list', list.map((project: any) => project.id === projectId ? { ...project, status: 'archived' } : project));
  },

  restoreProject: async (projectId: string) => {
    const client = getSupabaseClient();
    const session = client ? await storage.getAuthSession() : null;
    if (client && session) {
      const { error } = await client.from('projects').update({ status: 'active' }).eq('id', projectId);
      if (error) throw new Error(error.message);
    }
    const list = storage.getProjectsList();
    setLocalItem('bt_projects_list', list.map((project: any) => project.id === projectId ? { ...project, status: 'active' } : project));
  },

  deleteProject: async (projectId: string) => {
    const client = getSupabaseClient();
    const session = client ? await storage.getAuthSession() : null;
    if (client && session) {
      const { error } = await client.from('projects').delete().eq('id', projectId);
      if (error) throw new Error(error.message);
    }
    storage.deleteProjectLocal(projectId);
  },

  deleteProjectLocal: (projectId: string) => {
    const list = storage.getProjectsList().filter((project: any) => project.id !== projectId);
    setLocalItem('bt_projects_list', list.length ? list : [MOCK_PROJECT]);
    if (getActiveProjectId() === projectId) setLocalItem('bt_active_project_id', (list[0] || MOCK_PROJECT).id);
    [
      'bt_wbs','bt_activities','bt_dependencies','bt_design_packages','bt_design_comments','bt_daily_reports',
      'bt_daily_work_items','bt_material_logs','bt_budget_heads','bt_subcontractors','bt_ipc','bt_ipc_payments','bt_qaqc','bt_safety',
      'bt_variations_claims','bt_risks','bt_handover','bt_defects','bt_documents','bt_procurement_orders',
      'bt_store_items','bt_contract_obligations','bt_site_photos','bt_daily_expenses','bt_daily_resource_usage',
      'bt_employee_visits','bt_employees','bt_uploaded_documents','bt_inventory_events','bt_notifications'
    ].forEach(key => {
      const rows = getLocalItem<any[]>(key, []);
      if (Array.isArray(rows)) setLocalItem(key, rows.filter(row => row.project_id !== projectId));
    });
  },

  // 2. Users
  getUsers: () => {
    const users = getLocalItem<any[]>('bt_users', MOCK_USERS);
    const projectId = getActiveProjectId();
    const projectUsers = users.filter(user => !user.project_id || user.project_id === projectId);
    return [...new Map(projectUsers.map(user => [`${user.project_id || projectId}:${user.email.toLowerCase()}`, user])).values()];
  },
  addUser: (user: any) => {
    const users = storage.getUsers();
    const existingIndex = users.findIndex((item: any) => item.email.toLowerCase() === user.email.toLowerCase());
    const newUser = existingIndex >= 0
      ? { ...users[existingIndex], ...user }
      : { id: `usr-${Date.now()}`, ...user };
    if (existingIndex >= 0) users[existingIndex] = newUser;
    else users.push(newUser);
    setLocalItem('bt_users', users);
    if (existingIndex < 0) {
      void upsertProjectUser({
        ...newUser,
        project_id: getActiveProjectId(),
        auth_user_id: null
      });
    }
    return newUser;
  },

  updateCachedProjectUser: (user: any) => {
    const projectId = user.project_id || getActiveProjectId();
    const users = getLocalItem<any[]>('bt_users', MOCK_USERS);
    const index = users.findIndex(item => (item.project_id || projectId) === projectId && item.email.toLowerCase() === user.email.toLowerCase());
    const next = { ...(index >= 0 ? users[index] : {}), ...user, project_id: projectId };
    if (index >= 0) users[index] = next;
    else users.push(next);
    if (typeof window !== 'undefined') localStorage.setItem('bt_users', JSON.stringify(users));
    return next;
  },

  // 3. WBS (filtered by project)
  getWBS: () => {
    const projId = getActiveProjectId();
    const list = getLocalItem('bt_wbs', MOCK_WBS);
    return list.filter(w => w.project_id === projId);
  },

  setWbsRaw: (items: WbsItem[]) => {
    const projId = getActiveProjectId();
    const allItems = getLocalItem<WbsItem[]>('bt_wbs', MOCK_WBS);
    const remaining = allItems.filter(item => item.project_id !== projId);
    const formatted = items.map(item => ({ ...item, project_id: projId }));
    setLocalItem('bt_wbs', [...remaining, ...formatted]);
  },

  // 4. Activities (filtered by project)
  getActivities: (): Activity[] => {
    const projId = getActiveProjectId();
    const activities = getLocalItem('bt_activities', MOCK_ACTIVITIES);
    const filteredActs = activities.filter(a => a.project_id === projId);
    
    const deps = storage.getDependencies();
    const proj = storage.getProject();
    
    return calculateCPM(proj, filteredActs, deps);
  },

  getAllActivities: (): Activity[] => {
    const all = getLocalItem<(Activity & { project_id?: string })[]>('bt_activities', MOCK_ACTIVITIES);
    return storage.getProjectsList().flatMap((project: any) => {
      const rows = all.filter(activity => activity.project_id === project.id);
      const deps = getLocalItem<Dependency[]>('bt_dependencies', MOCK_DEPENDENCIES).filter(dep => dep.project_id === project.id);
      return calculateCPM(project, rows, deps);
    });
  },
  
  updateActivity: (updatedAct: Activity) => {
    const acts = getLocalItem('bt_activities', MOCK_ACTIVITIES);
    const idx = acts.findIndex(a => a.id === updatedAct.id);
    if (idx !== -1) {
      acts[idx] = { ...acts[idx], ...updatedAct };
      setLocalItem('bt_activities', acts);
      storage.recalculateSchedule();
    }
  },

  addManualActivity: (
    activity: Omit<Activity, 'id' | 'status' | 'actual_quantity'>,
    predecessor?: { id: string; type: Dependency['type']; lag: number }
  ) => {
    const projectId = getActiveProjectId();
    const activities = getLocalItem<any[]>('bt_activities', MOCK_ACTIVITIES);
    const id = `act-manual-${Date.now()}`;
    const newActivity: Activity & { project_id: string } = {
      ...activity,
      id,
      project_id: projectId,
      actual_quantity: 0,
      status: 'not_started'
    };
    activities.push(newActivity);
    setLocalItem('bt_activities', activities);

    const wbsItems = getLocalItem<WbsItem[]>('bt_wbs', MOCK_WBS);
    const segments = activity.wbs_code.split('.');
    segments.forEach((_, index) => {
      const code = segments.slice(0, index + 1).join('.');
      if (!wbsItems.some(item => item.project_id === projectId && item.wbs_code === code)) {
        wbsItems.push({
          id: `wbs-manual-${projectId}-${code.replaceAll('.', '-')}`,
          project_id: projectId,
          wbs_code: code,
          name: index === segments.length - 1 ? activity.name : `WBS ${code}`,
          parent_code: index === 0 ? null : segments.slice(0, index).join('.')
        });
      }
    });
    setLocalItem('bt_wbs', wbsItems);

    if (predecessor?.id) {
      storage.addDependency({
        predecessor_id: predecessor.id,
        successor_id: id,
        type: predecessor.type,
        lag: predecessor.lag
      });
    } else {
      storage.recalculateSchedule();
    }
    return newActivity;
  },

  // Bulk set WBS activities (useful for AI tender scans)
  setActivitiesRaw: (newActs: Activity[]) => {
    const projId = getActiveProjectId();
    const allActs = getLocalItem('bt_activities', MOCK_ACTIVITIES);
    // Clear items for active project and add new ones
    const filtered = allActs.filter(a => a.project_id !== projId);
    const formatted = newActs.map(a => ({ ...a, project_id: projId }));
    setLocalItem('bt_activities', [...filtered, ...formatted]);
    storage.recalculateSchedule();
  },

  // 5. Dependencies (filtered by project)
  getDependencies: (): Dependency[] => {
    const projId = getActiveProjectId();
    const deps = getLocalItem('bt_dependencies', MOCK_DEPENDENCIES);
    return deps.filter(d => d.project_id === projId);
  },
  
  addDependency: (dep: any) => {
    const projId = getActiveProjectId();
    const deps = getLocalItem('bt_dependencies', MOCK_DEPENDENCIES);
    const newDep = { id: `dep-${Date.now()}`, project_id: projId, ...dep };
    deps.push(newDep);
    setLocalItem('bt_dependencies', deps);
    storage.recalculateSchedule();
    return newDep;
  },

  deleteDependency: (id: string) => {
    const projectId = getActiveProjectId();
    const allDeps = getLocalItem('bt_dependencies', MOCK_DEPENDENCIES);
    const existing = allDeps.find((dependency: Dependency) => dependency.id === id && dependency.project_id === projectId);
    if (!existing) return;
    const filtered = allDeps.filter(d => d.id !== id);
    setLocalItem('bt_dependencies', filtered);
    storage.enqueueProjectRecordDeletion({ table: 'activity_dependencies', localKey: 'bt_dependencies', recordId: id, projectId });
    storage.recalculateSchedule();
  },

  // Bulk set dependencies (AI scans)
  setDependenciesRaw: (newDeps: Dependency[]) => {
    const projId = getActiveProjectId();
    const allDeps = getLocalItem('bt_dependencies', MOCK_DEPENDENCIES);
    const filtered = allDeps.filter(d => d.project_id !== projId);
    const formatted = newDeps.map(d => ({ ...d, project_id: projId }));
    setLocalItem('bt_dependencies', [...filtered, ...formatted]);
    storage.recalculateSchedule();
  },

  applyGeneratedSchedule: (items: WbsItem[], activities: Activity[], dependencies: Dependency[]) => {
    storage.setWbsRaw(items);
    storage.setActivitiesRaw(activities);
    storage.setDependenciesRaw(dependencies);
  },

  // CPM auto schedule re-trigger
  recalculateSchedule: () => {
    const projId = getActiveProjectId();
    const acts = getLocalItem('bt_activities', MOCK_ACTIVITIES);
    const filteredActs = acts.filter(a => a.project_id === projId);
    const deps = storage.getDependencies();
    const proj = storage.getProject();
    
    const recalculated = calculateCPM(proj, filteredActs, deps);
    
    // Save recalculated dates back to storage
    const remainingActs = acts.filter(a => a.project_id !== projId);
    setLocalItem('bt_activities', [...remainingActs, ...recalculated]);
  },

  // 6. Design packages (filtered by project)
  getDesignPackages: () => {
    const projId = getActiveProjectId();
    const pkgs = getLocalItem('bt_design_packages', MOCK_DESIGN_PACKAGES);
    return pkgs.filter(p => p.project_id === projId);
  },
  updateDesignPackage: (pkg: any) => {
    const pkgs = getLocalItem('bt_design_packages', MOCK_DESIGN_PACKAGES);
    const idx = pkgs.findIndex(p => p.id === pkg.id);
    if (idx !== -1) {
      pkgs[idx] = { ...pkgs[idx], ...pkg };
      setLocalItem('bt_design_packages', pkgs);
    }
  },
  getDesignComments: (pkgId: string) => {
    const comments = getLocalItem<any[]>('bt_design_comments', []);
    return comments.filter(c => c.design_package_id === pkgId);
  },
  addDesignComment: (comment: any) => {
    const projectId = getActiveProjectId();
    const comments = getLocalItem<any[]>('bt_design_comments', []);
    const newCmt = { id: `cmt-${Date.now()}`, project_id: projectId, created_at: new Date().toISOString(), ...comment };
    comments.push(newCmt);
    setLocalItem('bt_design_comments', comments);
    return newCmt;
  },

  // 7. Daily Site Progress Reports
  getDailyReports: () => {
    const projId = getActiveProjectId();
    const reports = getLocalItem('bt_daily_reports', MOCK_DAILY_REPORTS);
    return reports.filter(r => r.project_id === projId);
  },
  getDailyWorkItems: (reportId: string) => {
    const items = getLocalItem('bt_daily_work_items', MOCK_DAILY_WORK_ITEMS);
    return items.filter(it => it.daily_report_id === reportId);
  },
  getDailyMaterialLogs: (reportId: string) => {
    const logs = getLocalItem('bt_material_logs', MOCK_MATERIAL_LOGS);
    return logs.filter(l => l.daily_report_id === reportId);
  },
  
  submitDailyReport: (report: any, workItems: any[], materialItems: any[]) => {
    const projId = getActiveProjectId();
    const reports = getLocalItem('bt_daily_reports', MOCK_DAILY_REPORTS);
    const reportId = report.id || `rep-${Date.now()}`;
    const newReport = { id: reportId, project_id: projId, submitted_at: new Date().toISOString(), ...report };
    
    // Save report
    const existingIdx = reports.findIndex(r => r.id === reportId || (r.report_date === report.report_date && r.project_id === projId));
    if (existingIdx !== -1) {
      reports[existingIdx] = newReport;
    } else {
      reports.push(newReport);
    }
    setLocalItem('bt_daily_reports', reports);

    // Save work items
    const allWorkItems = getLocalItem('bt_daily_work_items', MOCK_DAILY_WORK_ITEMS);
    const filteredWork = allWorkItems.filter(it => it.daily_report_id !== reportId);
    const formattedWork = workItems.map(wi => ({ id: wi.id || `wi-${Math.random().toString(36).substr(2, 9)}`, project_id: projId, daily_report_id: reportId, ...wi }));
    setLocalItem('bt_daily_work_items', [...filteredWork, ...formattedWork]);

    // Save materials
    const allMats = getLocalItem('bt_material_logs', MOCK_MATERIAL_LOGS);
    const filteredMats = allMats.filter(l => l.daily_report_id !== reportId);
    const formattedMats = materialItems.map(m => ({ id: m.id || `mat-${Math.random().toString(36).substr(2, 9)}`, project_id: projId, daily_report_id: reportId, ...m }));
    setLocalItem('bt_material_logs', [...filteredMats, ...formattedMats]);

    // Update quantities and durations in WBS
    const allActs = getLocalItem('bt_activities', MOCK_ACTIVITIES);
    const completeWorkItems = [...filteredWork, ...formattedWork];
    
    allActs.forEach(act => {
      if (act.project_id === projId) {
        const actWorkItems = completeWorkItems.filter(wi => wi.activity_id === act.id);
        const totalQty = actWorkItems.reduce((sum, item) => sum + Number(item.quantity_completed), 0);
        act.actual_quantity = totalQty;
        
        if (totalQty >= act.planned_quantity) {
          act.status = 'completed';
          if (!act.actual_start) act.actual_start = report.report_date;
          act.actual_finish = report.report_date;
          act.remaining_duration = 0;
        } else if (totalQty > 0) {
          act.status = 'in_progress';
          if (!act.actual_start) act.actual_start = report.report_date;
          act.actual_finish = null;
          
          const filteredReportsForProject = reports.filter(r => r.project_id === projId);
          const startReport = filteredReportsForProject
            .filter(r => completeWorkItems.some(wi => wi.daily_report_id === r.id && wi.activity_id === act.id))
            .sort((a,b) => a.report_date.localeCompare(b.report_date))[0];
            
          const workingDays = startReport ? Math.max(1, diffDays(startReport.report_date, report.report_date) + 1) : 1;
          const productivity = totalQty / workingDays;
          const remainingQty = act.planned_quantity - totalQty;
          act.remaining_duration = productivity > 0 ? Math.ceil(remainingQty / productivity) : act.planned_duration;
        } else {
          act.status = 'not_started';
          act.actual_start = null;
          act.actual_finish = null;
          act.remaining_duration = act.planned_duration;
        }
      }
    });

    setLocalItem('bt_activities', allActs);
    storage.recalculateSchedule();
    return newReport;
  },
  deleteDailyReport: async (reportId: string) => {
    const client = getSupabaseClient();
    const session = client ? await storage.getAuthSession() : null;
    if (client && session) {
      const { error } = await client.from('daily_reports').delete().eq('id', reportId);
      if (error) throw new Error(error.message);
    }
    const reports = getLocalItem<any[]>('bt_daily_reports', MOCK_DAILY_REPORTS);
    const remaining = reports.filter(r => r.id !== reportId);
    setLocalItem('bt_daily_reports', remaining);

    const allWorkItems = getLocalItem<any[]>('bt_daily_work_items', MOCK_DAILY_WORK_ITEMS);
    const filteredWork = allWorkItems.filter(w => w.daily_report_id !== reportId);
    setLocalItem('bt_daily_work_items', filteredWork);

    const allMats = getLocalItem<any[]>('bt_material_logs', MOCK_MATERIAL_LOGS);
    const filteredMats = allMats.filter(m => m.daily_report_id !== reportId);
    setLocalItem('bt_material_logs', filteredMats);

    storage.recalculateSchedule();
  },

  // 8. Cost & Budget (filtered by project)
  getBudgetHeads: () => {
    const projId = getActiveProjectId();
    const budgets = getLocalItem('bt_budget_heads', MOCK_BUDGET_HEADS);
    return budgets.filter(b => b.project_id === projId);
  },
  
  updateBudgetHead: (budget: any) => {
    const budgets = getLocalItem('bt_budget_heads', MOCK_BUDGET_HEADS);
    const idx = budgets.findIndex(b => b.id === budget.id);
    if (idx !== -1) {
      budgets[idx] = { ...budgets[idx], ...budget };
      setLocalItem('bt_budget_heads', budgets);
    }
  },

  // 9. Subcontractor packages (filtered by project)
  getSubcontractors: () => {
    const projId = getActiveProjectId();
    const subs = getLocalItem('bt_subcontractors', MOCK_SUBCONTRACTORS);
    return subs.filter(s => s.project_id === projId);
  },
  
  updateSubcontractor: (sub: any) => {
    const subs = getLocalItem('bt_subcontractors', MOCK_SUBCONTRACTORS);
    const idx = subs.findIndex(s => s.id === sub.id);
    if (idx !== -1) {
      subs[idx] = { ...subs[idx], ...sub };
      setLocalItem('bt_subcontractors', subs);
    }
  },

  // 10. IPC Bills (filtered by project)
  getIPCs: () => {
    const projId = getActiveProjectId();
    const ipcs = getLocalItem('bt_ipc', MOCK_IPC);
    return ipcs.filter(i => i.project_id === projId);
  },

  getIPCPayments: (ipcId?: string): IpcPayment[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<IpcPayment[]>('bt_ipc_payments', MOCK_IPC_PAYMENTS)
      .filter(item => item.project_id === projectId && (!ipcId || item.ipc_id === ipcId))
      .sort((left, right) => right.payment_date.localeCompare(left.payment_date));
  },
  
  submitIPC: (ipc: any) => {
    const projId = getActiveProjectId();
    const ipcs = getLocalItem('bt_ipc', MOCK_IPC);
    const newIpc = {
      id: ipc.id || `ipc-${Date.now()}`,
      project_id: projId,
      status: 'pending',
      certified_amount: 0,
      paid_amount: 0,
      paid_date: null,
      certified_date: null,
      retention_deducted: 0,
      advance_recovered: 0,
      vat_amount: ipc.claimed_amount * 0.13,
      ...ipc
    };
    ipcs.push(newIpc);
    setLocalItem('bt_ipc', ipcs);
    return newIpc;
  },

  certifyIPC: (
    id: string,
    certification: number | {
      certified_amount: number;
      retention_deducted: number;
      advance_recovered: number;
      certified_date?: string;
      certificate_reference?: string;
      certified_by?: string;
      certification_remarks?: string;
      certificate_document_path?: string;
      certificate_document_url?: string;
    },
    legacyRetention = 0,
    legacyAdvance = 0,
  ) => {
    const ipcs = getLocalItem('bt_ipc', MOCK_IPC);
    const idx = ipcs.findIndex(i => i.id === id);
    if (idx !== -1) {
      const details = typeof certification === 'number'
        ? { certified_amount: certification, retention_deducted: legacyRetention, advance_recovered: legacyAdvance }
        : certification;
      ipcs[idx] = { ...ipcs[idx], ...details };
      ipcs[idx].status = 'certified';
      ipcs[idx].certified_date = details.certified_date || new Date().toISOString().split('T')[0];
      setLocalItem('bt_ipc', ipcs);
      return ipcs[idx];
    }
    return null;
  },

  payIPC: (id: string, paidAmount: number) => {
    const ipcs = getLocalItem('bt_ipc', MOCK_IPC);
    const idx = ipcs.findIndex(i => i.id === id);
    if (idx !== -1) {
      ipcs[idx].paid_amount = paidAmount;
      ipcs[idx].status = paidAmount >= ipcs[idx].certified_amount ? 'paid' : 'partially_paid';
      ipcs[idx].paid_date = new Date().toISOString().split('T')[0];
      setLocalItem('bt_ipc', ipcs);
    }
  },

  recordIPCPayment: async (
    payment: Omit<IpcPayment, 'id' | 'project_id' | 'proof_storage_path' | 'proof_url' | 'created_at'> & { id?: string },
    proof?: File | null,
  ) => {
    const projectId = getActiveProjectId();
    const id = payment.id || `ipc-payment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let proof_storage_path = '';
    let proof_url = '';
    if (proof) {
      const uploaded = await storage.uploadProjectDocument(
        proof,
        'ipc_payment',
        payment.ipc_id,
        payment.recorded_by || 'Finance User',
        `IPC payment ${payment.bank_reference}`,
      );
      proof_storage_path = uploaded.storage_path || '';
      proof_url = uploaded.url || '';
    }
    const record: IpcPayment = {
      ...payment,
      id,
      project_id: projectId,
      proof_storage_path,
      proof_url,
      created_at: new Date().toISOString(),
    };
    const rows = getLocalItem<IpcPayment[]>('bt_ipc_payments', MOCK_IPC_PAYMENTS);
    const existing = rows.findIndex(item => item.id === id);
    if (existing >= 0) rows[existing] = record;
    else rows.push(record);
    setLocalItem('bt_ipc_payments', rows);

    const ipcs = getLocalItem<IpcEntry[]>('bt_ipc', MOCK_IPC);
    const ipcIndex = ipcs.findIndex(item => item.id === payment.ipc_id);
    if (ipcIndex >= 0) {
      const totalPaid = rows.filter(item => item.ipc_id === payment.ipc_id).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const netPayable = Math.max(0, Number(ipcs[ipcIndex].certified_amount || 0) - Number(ipcs[ipcIndex].retention_deducted || 0) - Number(ipcs[ipcIndex].advance_recovered || 0));
      ipcs[ipcIndex] = {
        ...ipcs[ipcIndex],
        paid_amount: totalPaid,
        paid_date: rows.filter(item => item.ipc_id === payment.ipc_id).map(item => item.payment_date).sort().at(-1) || null,
        status: totalPaid >= netPayable ? 'paid' : 'partially_paid',
      };
      setLocalItem('bt_ipc', ipcs);
    }
    return record;
  },

  // 11. QAQC tests (filtered by project)
  getQAQC: () => {
    const projId = getActiveProjectId();
    const tests = getLocalItem('bt_qaqc', MOCK_QA_QC);
    return tests.filter(q => q.project_id === projId);
  },
  
  addQAQC: (item: any) => {
    const projId = getActiveProjectId();
    const items = getLocalItem('bt_qaqc', MOCK_QA_QC);
    const newItem = { id: `qa-${Date.now()}`, project_id: projId, ...item };
    items.push(newItem);
    setLocalItem('bt_qaqc', items);
    return newItem;
  },

  updateQAQC: (item: any) => {
    const items = getLocalItem('bt_qaqc', MOCK_QA_QC);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...item };
      setLocalItem('bt_qaqc', items);
    }
  },

  // 12. Safety/EHS logs (filtered by project)
  getSafetyLogs: () => {
    const projId = getActiveProjectId();
    const logs = getLocalItem('bt_safety', MOCK_SAFETY);
    return logs.filter(s => s.project_id === projId);
  },
  
  addSafetyLog: (log: any) => {
    const projId = getActiveProjectId();
    const logs = getLocalItem('bt_safety', MOCK_SAFETY);
    const newLog = { id: `sf-${Date.now()}`, project_id: projId, ...log };
    logs.push(newLog);
    setLocalItem('bt_safety', logs);
    return newLog;
  },

  // 13. Claims (filtered by project)
  getClaims: () => {
    const projId = getActiveProjectId();
    const claims = getLocalItem('bt_variations_claims', MOCK_VARIATIONS_CLAIMS);
    return claims.filter(c => c.project_id === projId);
  },
  
  addClaim: (claim: any) => {
    const projId = getActiveProjectId();
    const claims = getLocalItem('bt_variations_claims', MOCK_VARIATIONS_CLAIMS);
    const newClaim = { id: `clm-${Date.now()}`, project_id: projId, status: 'registered', ...claim };
    claims.push(newClaim);
    setLocalItem('bt_variations_claims', claims);
    return newClaim;
  },

  updateClaim: (claim: any) => {
    const claims = getLocalItem('bt_variations_claims', MOCK_VARIATIONS_CLAIMS);
    const idx = claims.findIndex(c => c.id === claim.id);
    if (idx !== -1) {
      claims[idx] = { ...claims[idx], ...claim };
      setLocalItem('bt_variations_claims', claims);
    }
  },

  // 14. Risks (filtered by project)
  getRisks: () => {
    const projId = getActiveProjectId();
    const list = getLocalItem('bt_risks', MOCK_RISKS);
    return list.filter(r => r.project_id === projId);
  },
  
  addRisk: (risk: any) => {
    const projId = getActiveProjectId();
    const list = getLocalItem('bt_risks', MOCK_RISKS);
    const newRisk = { id: `rsk-${Date.now()}`, project_id: projId, status: 'open', ...risk };
    list.push(newRisk);
    setLocalItem('bt_risks', list);
    return newRisk;
  },

  updateRisk: (risk: any) => {
    const list = getLocalItem('bt_risks', MOCK_RISKS);
    const idx = list.findIndex(r => r.id === risk.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...risk };
      setLocalItem('bt_risks', list);
    }
  },

  // 15. Handover (filtered by project)
  getHandoverChecklist: () => {
    const projId = getActiveProjectId();
    const list = getLocalItem('bt_handover', MOCK_HANDOVER);
    return list.filter(h => h.project_id === projId || !h.project_id); // Fallback for baseline
  },

  addHandoverItem: (item: Omit<HandoverItem, 'id' | 'project_id' | 'status' | 'approved_by' | 'approved_date'>) => {
    const list = getLocalItem<HandoverItem[]>('bt_handover', MOCK_HANDOVER);
    const record: HandoverItem = {
      ...item,
      id: `handover-${Date.now()}`,
      project_id: getActiveProjectId(),
      status: 'pending',
      approved_by: null,
      approved_date: null,
    };
    list.push(record);
    setLocalItem('bt_handover', list);
    return record;
  },

  completeHandoverItem: (id: string, completion: Partial<HandoverItem>) => {
    const list = getLocalItem<HandoverItem[]>('bt_handover', MOCK_HANDOVER);
    const index = list.findIndex(item => item.id === id);
    if (index < 0) return null;
    list[index] = { ...list[index], ...completion, status: 'approved' };
    setLocalItem('bt_handover', list);
    return list[index];
  },
  
  toggleHandoverItem: (id: string, approvedBy: string) => {
    const list = getLocalItem('bt_handover', MOCK_HANDOVER);
    const idx = list.findIndex(i => i.id === id);
    if (idx !== -1) {
      list[idx].status = list[idx].status === 'approved' ? 'pending' : 'approved';
      list[idx].approved_by = list[idx].status === 'approved' ? approvedBy : null;
      list[idx].approved_date = list[idx].status === 'approved' ? new Date().toISOString().split('T')[0] : null;
      setLocalItem('bt_handover', list);
    }
  },

  // 16. Defects DLP (filtered by project)
  getDefects: () => {
    const projId = getActiveProjectId();
    const list = getLocalItem('bt_defects', MOCK_DEFECTS);
    return list.filter(d => d.project_id === projId);
  },
  
  addDefect: (defect: any) => {
    const projId = getActiveProjectId();
    const list = getLocalItem('bt_defects', MOCK_DEFECTS);
    const newDefect = { id: `def-${Date.now()}`, project_id: projId, status: 'pending', ...defect };
    list.push(newDefect);
    setLocalItem('bt_defects', list);
    return newDefect;
  },

  updateDefectStatus: (id: string, status: 'pending' | 'rectified' | 'verified', updates: Partial<DefectEntry> = {}) => {
    const list = getLocalItem('bt_defects', MOCK_DEFECTS);
    const idx = list.findIndex(d => d.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, status };
      setLocalItem('bt_defects', list);
    }
  },

  getFinanceRows: (): FinanceRow[] => {
    const projectId = getActiveProjectId();
    const allRows = getLocalItem<Record<string, FinanceRow[]>>('bt_finance_rows', {});
    return allRows[projectId] || [];
  },

  saveFinanceRows: (rows: FinanceRow[]) => {
    const projectId = getActiveProjectId();
    const allRows = getLocalItem<Record<string, FinanceRow[]>>('bt_finance_rows', {});
    allRows[projectId] = rows;
    setLocalItem('bt_finance_rows', allRows);
  },

  getDocuments: (defaults: DocumentItem[] = []): DocumentItem[] => {
    const projectId = getActiveProjectId();
    const allDocuments = getLocalItem<DocumentItem[]>('bt_documents', []);
    const projectDocuments = allDocuments.filter(doc => doc.project_id === projectId);
    if (projectDocuments.length > 0) return projectDocuments;
    const seeded = defaults.map(doc => ({ ...doc, project_id: projectId }));
    if (seeded.length > 0) setLocalItem('bt_documents', [...allDocuments, ...seeded]);
    return seeded;
  },

  saveDocuments: (documents: DocumentItem[]) => {
    const projectId = getActiveProjectId();
    const allDocuments = getLocalItem<DocumentItem[]>('bt_documents', []);
    const remaining = allDocuments.filter(doc => doc.project_id !== projectId);
    setLocalItem('bt_documents', [
      ...remaining,
      ...documents.map(doc => ({ ...doc, project_id: projectId }))
    ]);
  },

  getProcurementOrders: (): ProcurementOrder[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<ProcurementOrder[]>('bt_procurement_orders', []).filter(item => item.project_id === projectId);
  },

  saveProcurementOrder: (order: Omit<ProcurementOrder, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const orders = getLocalItem<ProcurementOrder[]>('bt_procurement_orders', []);
    const record = { ...order, id: order.id || `po-${Date.now()}`, project_id: projectId } as ProcurementOrder;
    const index = orders.findIndex(item => item.id === record.id);
    if (index >= 0) orders[index] = record;
    else orders.push(record);
    setLocalItem('bt_procurement_orders', orders);
    return record;
  },

  getStoreItems: (): StoreItem[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<StoreItem[]>('bt_store_items', []).filter(item => item.project_id === projectId);
  },

  saveStoreItem: (item: Omit<StoreItem, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const items = getLocalItem<StoreItem[]>('bt_store_items', []);
    const record = { ...item, id: item.id || `store-${Date.now()}`, project_id: projectId } as StoreItem;
    const index = items.findIndex(existing => existing.id === record.id);
    if (index >= 0) items[index] = record;
    else items.push(record);
    setLocalItem('bt_store_items', items);
    return record;
  },

  getContractObligations: (): ContractObligation[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<ContractObligation[]>('bt_contract_obligations', []).filter(item => item.project_id === projectId);
  },

  getDailyExpenses: (): DailyExpense[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<DailyExpense[]>('bt_daily_expenses', []).filter(item => item.project_id === projectId);
  },

  getAllDailyExpenses: (): DailyExpense[] => getLocalItem<DailyExpense[]>('bt_daily_expenses', []),

  getEmployees: (): EmployeeProfile[] => {
    const projectId = getActiveProjectId();
    const seeded = storage.getUsers().map((user: any, index: number) => ({
      id: `emp-seed-${index}`,
      project_id: projectId,
      employee_id: user.employee_id || `EMP-${String(index + 1).padStart(3, '0')}`,
      name: user.name,
      email: user.email,
      role: user.role?.replaceAll('_', ' ') || 'Team Member',
      trade: user.role?.replaceAll('_', ' ') || '',
      site_location: 'Project Office',
      daily_rate: 0,
      status: 'active' as const,
      assigned_to: projectId
    }));
    const rows = getLocalItem<EmployeeProfile[]>('bt_employees', seeded);
    const existing = rows.filter(item => item.project_id === projectId);
    return existing.length ? existing : seeded;
  },

  saveEmployee: (employee: Omit<EmployeeProfile, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const rows = getLocalItem<EmployeeProfile[]>('bt_employees', []);
    const record = { ...employee, id: employee.id || `emp-${Date.now()}`, project_id: projectId } as EmployeeProfile;
    const index = rows.findIndex(item => item.id === record.id || (item.project_id === projectId && item.employee_id === record.employee_id));
    if (index >= 0) rows[index] = { ...rows[index], ...record };
    else rows.push(record);
    setLocalItem('bt_employees', rows);
    void upsertCloudRow('employee_profiles', record as unknown as Record<string, unknown>);
    return record;
  },

  saveDailyExpense: (expense: Omit<DailyExpense, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const expenses = getLocalItem<DailyExpense[]>('bt_daily_expenses', []);
    const record = { ...expense, id: expense.id || `expense-${Date.now()}`, project_id: projectId } as DailyExpense;
    const index = expenses.findIndex(item => item.id === record.id);
    if (index >= 0) expenses[index] = record;
    else expenses.push(record);
    setLocalItem('bt_daily_expenses', expenses);
    void upsertCloudRow('daily_expenses', record as unknown as Record<string, unknown>);
    return record;
  },

  getNotifications: (limit = 20): AppNotification[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<AppNotification[]>('bt_notifications', [])
      .filter(item => !item.project_id || item.project_id === projectId)
      .slice(0, limit);
  },

  getAllNotifications: (limit = 50): AppNotification[] => {
    return getLocalItem<AppNotification[]>('bt_notifications', []).slice(0, limit);
  },

  markNotificationsRead: () => {
    const projectId = getActiveProjectId();
    const rows = getLocalItem<AppNotification[]>('bt_notifications', []);
    setLocalItem('bt_notifications', rows.map(item => item.project_id === projectId ? { ...item, read: true } : item));
  },

  markAllNotificationsRead: () => {
    const rows = getLocalItem<AppNotification[]>('bt_notifications', []);
    setLocalItem('bt_notifications', rows.map(item => ({ ...item, read: true })));
  },

  getUploadedDocuments: (): UploadedDocument[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<UploadedDocument[]>('bt_uploaded_documents', []).filter(item => item.project_id === projectId);
  },

  uploadProjectDocument: async (
    file: File,
    category: UploadedDocument['category'],
    linkedRecordId = '',
    uploadedBy = 'BuildTrack User',
    remarks = ''
  ): Promise<UploadedDocument> => {
    const projectId = getActiveProjectId();
    const client = getSupabaseClient();
    let url = '';
    let storagePath = '';
    try {
      const googleFile = await uploadToTenantGoogleDrive(file, category === 'payment_slip' ? 'expense' : 'document', {
        date: new Date().toISOString().slice(0, 10),
        employee: uploadedBy,
        boq: linkedRecordId || 'general',
        remarks: remarks || file.name,
        reference: linkedRecordId,
      });
      if (googleFile) {
        storagePath = `google-drive:${googleFile.id}`;
        url = googleFile.webViewLink || '';
      }
    } catch (error) {
      console.warn('Google Drive document upload skipped:', error instanceof Error ? error.message : String(error));
    }
    if (!storagePath && client && file.size > 0) {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session) throw new Error('Sign in before uploading a document.');
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const bucket = category === 'payment_slip' ? 'payment-slips' : 'project-documents';
        const path = `${projectId}/${session.user.id}/${category}/${Date.now()}-${safeName}`;
        const { error } = await client.storage.from(bucket).upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (error) throw new Error(error.message);
        storagePath = path;
      } catch (error) {
        if (!isNetworkLikeError(error)) throw new Error(`Document upload failed: ${error instanceof Error ? error.message : String(error)}. Check the managed document storage policy.`);
        url = await fileToDataUrl(file);
        console.warn('Document saved locally because Supabase storage is unreachable.');
      }
    } else if (!storagePath && file.size > 0) {
      url = await fileToDataUrl(file);
    }
    const record: UploadedDocument = {
      id: `doc-upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      project_id: projectId,
      name: file.name,
      category,
      storage_path: storagePath,
      url,
      linked_record_id: linkedRecordId,
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
      remarks,
    };
    const rows = getLocalItem<UploadedDocument[]>('bt_uploaded_documents', []);
    setLocalItem('bt_uploaded_documents', [record, ...rows]);
    void upsertCloudRow('uploaded_documents', record as unknown as Record<string, unknown>);
    return record;
  },

  getPrivateDocumentUrl: async (storagePath: string, category: UploadedDocument['category'] = 'other') => {
    if (!storagePath) return '';
    if (storagePath.startsWith('google-drive:')) return '';
    const client = getSupabaseClient();
    if (!client) return '';
    const bucket = category === 'payment_slip' ? 'payment-slips' : 'project-documents';
    const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, 60);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  getDailyResourceUsage: (): DailyResourceUsage[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<DailyResourceUsage[]>('bt_daily_resource_usage', []).filter(item => item.project_id === projectId);
  },

  getAllDailyResourceUsage: (): DailyResourceUsage[] => getLocalItem<DailyResourceUsage[]>('bt_daily_resource_usage', []),

  saveDailyResourceUsage: (usage: Omit<DailyResourceUsage, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const rows = getLocalItem<DailyResourceUsage[]>('bt_daily_resource_usage', []);
    const record = { ...usage, id: usage.id || `resource-${Date.now()}`, project_id: projectId } as DailyResourceUsage;
    const index = rows.findIndex(item => item.id === record.id);
    if (index >= 0) rows[index] = record;
    else rows.push(record);
    setLocalItem('bt_daily_resource_usage', rows);
    void upsertCloudRow('daily_resource_usage', record as unknown as Record<string, unknown>);
    return record;
  },

  getInventoryEvents: (): InventoryEvent[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<InventoryEvent[]>('bt_inventory_events', []).filter(item => item.project_id === projectId);
  },

  saveInventoryEvent: (event: Omit<InventoryEvent, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const rows = getLocalItem<InventoryEvent[]>('bt_inventory_events', []);
    const record = { ...event, id: event.id || `inv-event-${Date.now()}`, project_id: projectId } as InventoryEvent;
    const index = rows.findIndex(item => item.id === record.id);
    if (index >= 0) rows[index] = record;
    else rows.push(record);
    setLocalItem('bt_inventory_events', rows);
    void upsertCloudRow('inventory_events', record as unknown as Record<string, unknown>);
    return record;
  },

  getEmployeeVisits: (): EmployeeVisit[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<EmployeeVisit[]>('bt_employee_visits', []).filter(item => item.project_id === projectId);
  },

  getAllEmployeeVisits: (): EmployeeVisit[] => getLocalItem<EmployeeVisit[]>('bt_employee_visits', []),

  saveEmployeeVisit: (visit: Omit<EmployeeVisit, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const rows = getLocalItem<EmployeeVisit[]>('bt_employee_visits', []);
    const record = { ...visit, id: visit.id || `visit-${Date.now()}`, project_id: projectId } as EmployeeVisit;
    const index = rows.findIndex(item => item.id === record.id);
    if (index >= 0) rows[index] = record;
    else rows.push(record);
    setLocalItem('bt_employee_visits', rows);
    void upsertCloudRow('employee_visits', record as unknown as Record<string, unknown>);
    return record;
  },

  saveContractObligation: (item: Omit<ContractObligation, 'id' | 'project_id'> & { id?: string }) => {
    const projectId = getActiveProjectId();
    const items = getLocalItem<ContractObligation[]>('bt_contract_obligations', []);
    const record = { ...item, id: item.id || `obl-${Date.now()}`, project_id: projectId } as ContractObligation;
    const index = items.findIndex(existing => existing.id === record.id);
    if (index >= 0) items[index] = record;
    else items.push(record);
    setLocalItem('bt_contract_obligations', items);
    return record;
  },

  getSitePhotos: (reportId?: string): SitePhoto[] => {
    const projectId = getActiveProjectId();
    return getLocalItem<SitePhoto[]>('bt_site_photos', []).filter(photo =>
      photo.project_id === projectId && (!reportId || photo.daily_report_id === reportId)
    );
  },

  saveSitePhotos: (photos: SitePhoto[]) => {
    const projectId = getActiveProjectId();
    const allPhotos = getLocalItem<SitePhoto[]>('bt_site_photos', []);
    const ids = new Set(photos.map(photo => photo.id));
    const remaining = allPhotos.filter(photo => photo.project_id !== projectId || !ids.has(photo.id));
    setLocalItem('bt_site_photos', [
      ...remaining,
      ...photos.map(photo => ({ ...photo, project_id: projectId }))
    ]);
  },

  getSitePhotosForRole: async (role: string, reportId?: string): Promise<SitePhoto[]> => {
    if (role !== 'project_director') return [];
    const photos = storage.getSitePhotos(reportId);
    const client = getSupabaseClient();
    if (!client) return photos;
    return Promise.all(photos.map(async photo => {
      if (!photo.storage_path) return photo;
      if (photo.storage_path.startsWith('google-drive:')) return photo;
      const { data, error } = await client.storage.from('site-photos').createSignedUrl(photo.storage_path, 3600);
      return error ? photo : { ...photo, url: data.signedUrl };
    }));
  },

  uploadSitePhoto: async (
    file: File,
    reportId: string,
    caption: string,
    uploadedBy = 'Site Team',
    evidenceType: SitePhoto['evidence_type'] = 'progress'
  ): Promise<SitePhoto> => {
    const projectId = getActiveProjectId();
    if (!storage.getDailyReports().some(report => report.id === reportId && report.project_id === projectId)) {
      throw new Error('Choose a daily report from the active project before uploading evidence.');
    }
    if (file.size <= 0) throw new Error('Choose a non-empty image file.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Site evidence images must be 10 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Site evidence must be a JPG, PNG, or WebP image.');
    }
    const client = getSupabaseClient();
    let url = '';
    let storagePath = '';
    try {
      const googleFile = await uploadToTenantGoogleDrive(file, 'photo', {
        date: new Date().toISOString().slice(0, 10),
        employee: uploadedBy,
        boq: reportId,
        remarks: caption || evidenceType || file.name,
      });
      if (googleFile) {
        storagePath = `google-drive:${googleFile.id}`;
        url = googleFile.webViewLink || '';
      }
    } catch (error) {
      console.warn('Google Drive photo upload skipped:', error instanceof Error ? error.message : String(error));
    }
    if (!storagePath && client) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `${projectId}/${reportId}/${Date.now()}-${safeName}`;
        const { error } = await client.storage.from('site-photos').upload(path, file, {
          contentType: file.type,
          upsert: false
        });
        if (error) {
          throw new Error(`Image upload failed: ${error.message}. Check the site-photos bucket and storage RLS policy for this user's project role.`);
        } else {
          storagePath = path;
        }
      } catch (e) {
        if (!isNetworkLikeError(e)) throw e instanceof Error ? e : new Error(String(e));
        url = await fileToDataUrl(file);
        console.warn('Site photo saved locally because Supabase storage is unreachable.');
      }
    } else if (!storagePath) {
      url = await fileToDataUrl(file);
    }
    const photo: SitePhoto = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      project_id: projectId,
      daily_report_id: reportId,
      name: file.name,
      url,
      storage_path: storagePath,
      caption,
      captured_at: new Date().toISOString(),
      uploaded_by: uploadedBy,
      evidence_type: evidenceType
    };
    if (client && storagePath) {
      try {
        const { error } = await client.from('site_photos').insert(photo);
        if (error) {
          throw new Error(`Image metadata save failed: ${error.message}. The file uploaded but the site_photos row was blocked by RLS.`);
        }
      } catch (e) {
        if (!isNetworkLikeError(e)) throw e instanceof Error ? e : new Error(String(e));
        console.warn('Site photo metadata saved locally because Supabase table is unreachable.');
      }
    }
    storage.saveSitePhotos([photo]);
    return photo;
  },

  syncActiveProjectToCloud: async () => {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: 'Supabase is not configured.' };
    const session = await storage.getAuthSession();
    if (!session) return { ok: false, message: 'Sign in to Supabase before synchronizing.' };
    const projectId = getActiveProjectId();
    const project = storage.getProject();
    const currentProfile = await storage.getCurrentAuthUser();
    const signedInUser = currentProfile || {
      name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'BuildTrack User',
      email: session.user.email || '',
      role: session.user.user_metadata?.role || 'project_manager'
    };
    const setup = await storage.ensureActiveProjectMembership(signedInUser);
    if (!setup.ok) return setup;
    const reports = storage.getDailyReports();
    const designPackages = storage.getDesignPackages();
    const designComments = designPackages.flatMap((pkg: any) =>
      storage.getDesignComments(pkg.id).map((comment: any) => ({ ...comment, project_id: projectId }))
    );
    const tableRows: Array<[string, any[]]> = [
      ['wbs_items', storage.getWBS()],
      ['activities', storage.getActivities().map(({ early_start, early_finish, late_start, late_finish, total_float, free_float, is_critical, is_near_critical, ...activity }) => ({ ...activity, project_id: projectId }))],
      ['activity_dependencies', storage.getDependencies()],
      ['design_packages', designPackages],
      ['design_comments', designComments],
      ['daily_reports', reports],
      ['daily_work_items', reports.flatMap((report: any) => storage.getDailyWorkItems(report.id)).map((item: any) => ({ ...item, project_id: projectId }))],
      ['material_logs', reports.flatMap((report: any) => storage.getDailyMaterialLogs(report.id)).map((item: any) => ({ ...item, project_id: projectId }))],
      ['budget_heads', storage.getBudgetHeads()],
      ['subcontractor_packages', storage.getSubcontractors()],
      ['ipc_submissions', storage.getIPCs()],
      ['ipc_payments', storage.getIPCPayments()],
      ['qa_qc_inspections', storage.getQAQC()],
      ['safety_logs', storage.getSafetyLogs()],
      ['variations_and_claims', storage.getClaims()],
      ['risk_register', storage.getRisks()],
      ['handover_checklists', storage.getHandoverChecklist().map((item: any) => ({ ...item, project_id: projectId }))],
      ['defects_liability', storage.getDefects()],
      ['document_register', storage.getDocuments()],
      ['procurement_orders', storage.getProcurementOrders()],
      ['store_items', storage.getStoreItems()],
      ['contract_obligations', storage.getContractObligations()],
      ['daily_expenses', storage.getDailyExpenses()],
      ['daily_resource_usage', storage.getDailyResourceUsage()],
      ['employee_visits', storage.getEmployeeVisits()],
      ['employee_profiles', storage.getEmployees()],
      ['uploaded_documents', storage.getUploadedDocuments()],
      ['inventory_events', storage.getInventoryEvents()],
      ['app_notifications', storage.getNotifications(200)],
      ['finance_rows', storage.getFinanceRows().map(row => ({
        id: row.id, project_id: projectId, row_key: row.id, name: row.name,
        category: row.category, monthly_values: row.values
      }))]
    ];
    const { error: projectSyncError } = await client.from('projects').upsert(project, { onConflict: 'id' });
    if (projectSyncError) return { ok: false, message: `projects: ${projectSyncError.message}` };
    // Never replace a project collection by deleting it first. A stale browser,
    // failed network request, or concurrent editor must not erase records that
    // are absent from this local cache. Explicit deletions replay as scoped
    // tombstone mutations; all other synchronization is merge-only by id.
    for (const [table, rows] of tableRows) {
      if (rows.length === 0) continue;
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) return { ok: false, message: `${table}: ${error.message}` };
    }
    const membership = await storage.syncUserToSupabase(signedInUser);
    if (!membership.ok) return { ok: false, message: membership.error || 'Could not synchronize current project membership.' };
    localStorage.setItem('bt_last_cloud_sync', new Date().toISOString());
    return { ok: true, message: `Synchronized ${tableRows.reduce((sum, [, rows]) => sum + rows.length, 0)} records.` };
  },

  pullActiveProjectFromCloud: async () => {
    return pullProjectSetFromCloud([getActiveProjectId()], false);
  }
};

// Reconnection retries only mutations scoped to the currently active project.
// The outbox itself verifies project, tenant and actor scope before any write.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (isSupabaseConfigured()) void storage.flushDurableMutations(getActiveProjectId());
  });
}
