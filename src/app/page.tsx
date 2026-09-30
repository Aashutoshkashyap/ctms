'use client';

import React, { useState, useEffect } from 'react';
import { storage } from '../lib/storage';
import { calculateEVM, EVMMetrics } from '../lib/evm';
import { Activity, Dependency, diffDays } from '../lib/cpm';

// Dashboard views imports
import CpmTimelineDashboard from '../components/CpmTimelineDashboard';
import ExpectedActualDashboard from '../components/ExpectedActualDashboard';
import DesignDashboard from '../components/DesignDashboard';
import BudgetDashboard from '../components/BudgetDashboard';
import IpcDashboard from '../components/IpcDashboard';
import CommercialControlWorkspace from '../components/CommercialControlWorkspace';
import QaqcDashboard from '../components/QaqcDashboard';
import SafetyDashboard from '../components/SafetyDashboard';
import HandoverDashboard from '../components/HandoverDashboard';
import DefectsDashboard from '../components/DefectsDashboard';
import SettingsPanel from '../components/SettingsPanel';
import AuthLayout from '../components/AuthLayout';
import DocumentTracker from '../components/DocumentTracker';
import DocumentVault from '../components/DocumentVault';
import ProcurementStoresDashboard from '../components/ProcurementStoresDashboard';
import ContractObligationsDashboard from '../components/ContractObligationsDashboard';
import DailyReportingDashboard from '../components/DailyReportingDashboard';
import ReportCenter from '../components/ReportCenter';
import DailyExpenseDashboard from '../components/DailyExpenseDashboard';
import OperationalControlDashboard from '../components/OperationalControlDashboard';
import EvidenceVault from '../components/EvidenceVault';
import DirectorPortfolioDashboard from '../components/DirectorPortfolioDashboard';
import SuperAdminDashboard from '../components/SuperAdminDashboard';
import SubscriptionDashboard from '../components/SubscriptionDashboard';
import BsDatePicker from '../components/BsDatePicker';
import IpcValuationWorkspace from '../components/IpcValuationWorkspace';
import PaymentCertificateWorkspace from '../components/PaymentCertificateWorkspace';
import { AlertHub, DepartmentHub, PeopleHub, WorkHub } from '../components/ProjectExperience';
import { ManagementHome, ProjectOverview } from '../components/ManagementHome';
import { PageHeader, SectionHeader } from '../components/ManagementUI';
import ModuleSnapshot from '../components/ModuleSnapshot';
import { formatBsDate } from '../lib/nepaliDate';
import { isCurrentProject, projectIdFromUrl, workspaceUrl } from '../lib/projectContext';
import { can, ROLE_LABELS, normalizeRole } from '../lib/permissions';
import type { Feature, FeaturePermissions } from '../lib/permissions';

type ActiveTab =
  | 'dashboard' | 'projects' | 'people' | 'work' | 'departments' | 'notifications'
  | 'workforce' | 'stores'
  | 'cpm' | 'expected_actual'
  | 'design' | 'budget' | 'ipc' | 'claims'
  | 'qaqc' | 'safety'
  | 'handover' | 'defects'
  | 'documents'
  | 'procurement' | 'obligations' | 'daily' | 'reports' | 'expenses'
  | 'operations' | 'evidence' | 'subscription'
  | 'settings';

const TAB_FEATURES: Partial<Record<ActiveTab, Feature>> = {
  people: 'operations', workforce: 'operations', work: 'daily_reports',
  cpm: 'schedule', expected_actual: 'schedule', daily: 'daily_reports',
  operations: 'operations', evidence: 'view_evidence', design: 'design', budget: 'budget',
  ipc: 'ipc', claims: 'claims', procurement: 'procurement', stores: 'procurement', obligations: 'obligations',
  qaqc: 'qaqc', safety: 'safety', expenses: 'expenses',
  documents: 'documents', reports: 'reports', handover: 'handover', defects: 'defects',
  subscription: 'subscription', settings: 'settings',
};

type ManagementModule = {
  id: string;
  label: string;
  icon: string;
  views: ReadonlyArray<{ tab: ActiveTab; label: string }>;
};

// Legacy tab IDs remain the internal navigation contract used by dashboard cards,
// department tools, and the Work Board. The twelve entries below own their UI.
const MANAGEMENT_MODULES: ReadonlyArray<ManagementModule> = [
  { id: 'home', label: 'Home', icon: '🏠', views: [{ tab: 'dashboard', label: 'Overview' }] },
  { id: 'projects', label: 'Projects', icon: '🏗️', views: [{ tab: 'projects', label: 'Projects' }] },
  { id: 'people', label: 'People', icon: '👥', views: [{ tab: 'people', label: 'Assignments' }, { tab: 'workforce', label: 'Workforce & visits' }] },
  { id: 'work', label: 'Work', icon: '📋', views: [{ tab: 'work', label: 'Board' }, { tab: 'cpm', label: 'Schedule & WBS' }, { tab: 'expected_actual', label: 'Progress' }, { tab: 'daily', label: 'Daily reports' }, { tab: 'design', label: 'Design' }, { tab: 'handover', label: 'Handover' }] },
  { id: 'fleet', label: 'Fleet', icon: '🚜', views: [{ tab: 'operations', label: 'Equipment & usage' }] },
  { id: 'inventory', label: 'Inventory', icon: '📦', views: [{ tab: 'stores', label: 'Stock & movements' }] },
  { id: 'purchases', label: 'Purchases', icon: '🛒', views: [{ tab: 'procurement', label: 'Purchase orders' }] },
  { id: 'commercial', label: 'Commercial', icon: '💼', views: [{ tab: 'budget', label: 'Cost & budget' }, { tab: 'ipc', label: 'Valuation & IPC' }, { tab: 'claims', label: 'Claims & variations' }, { tab: 'obligations', label: 'Contracts & securities' }, { tab: 'expenses', label: 'Expenses' }] },
  { id: 'quality-safety', label: 'Quality & Safety', icon: '🦺', views: [{ tab: 'qaqc', label: 'Quality' }, { tab: 'safety', label: 'Safety' }, { tab: 'defects', label: 'Defects' }] },
  { id: 'document-vault', label: 'Document Vault', icon: '📁', views: [{ tab: 'documents', label: 'Documents' }, { tab: 'evidence', label: 'Photos & evidence' }] },
  { id: 'reports', label: 'Reports', icon: '📊', views: [{ tab: 'reports', label: 'Reports' }] },
  { id: 'settings', label: 'Settings', icon: '⚙️', views: [{ tab: 'settings', label: 'Settings' }, { tab: 'departments', label: 'Departments' }, { tab: 'subscription', label: 'Subscription' }] },
];

const moduleForTab = (tab: ActiveTab) => MANAGEMENT_MODULES.find(module => module.views.some(view => view.tab === tab));
const isKnownTab = (value: string): value is ActiveTab => value === 'notifications' || MANAGEMENT_MODULES.some(module => module.views.some(view => view.tab === value));

interface AuthUser {
  name: string;
  email: string;
  role: string;
  feature_permissions?: FeaturePermissions | null;
}

// ---------------------------------------------------------------------------
// Create Project Modal
// ---------------------------------------------------------------------------
function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(100000000);
  const [startDate, setStartDate] = useState(
    () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0]
  );
  const [duration, setDuration] = useState(730);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await storage.createProject(name, amount, startDate, duration);
      onCreated();
      onClose();
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Could not create the project.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <div className="flex justify-between items-center">
          <h2 id="create-project-title" className="text-xl font-bold text-slate-950">Create a project</h2>
          <button type="button" onClick={onClose} aria-label="Close create project" className="text-slate-600 hover:text-slate-900 text-lg">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Project name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pokhara Airport Access Road (D&B)"
              className="w-full bg-white border border-slate-300 p-2.5 rounded-lg text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-600"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Contract start date</label>
              <BsDatePicker value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Duration (days)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-white border border-slate-300 p-2.5 rounded-lg text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-600"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Contract amount (NPR)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full bg-white border border-slate-300 p-2.5 rounded-lg text-slate-950 focus-visible:outline-2 focus-visible:outline-blue-600"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg transition"
            >
              {submitting ? 'Creating…' : 'Create Project'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
          </div>
          {error && <p className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Nav Button helper
// ---------------------------------------------------------------------------
function NavBtn({
  tab,
  active,
  setActiveTab,
  icon,
  label,
}: {
  tab: ActiveTab;
  active: boolean;
  setActiveTab: (t: ActiveTab) => void;
  icon: string;
  label: string;
}) {
  const base = 'app-primary-link w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
  const styles = active ? `${base} bg-blue-700 text-white shadow-sm` : `${base} text-slate-700 hover:bg-blue-50 hover:text-blue-800`;

  return (
    <button type="button" onClick={() => setActiveTab(tab)} className={styles} aria-current={active ? 'page' : undefined}>
      <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center text-lg">{icon}</span><span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main App Shell
// ---------------------------------------------------------------------------
export default function DashboardShell() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentDate] = useState<string>(
    () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0]
  );

  // ---- Auth State ----
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // ---- Project switcher ----
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(() => storage.getActiveProjectId());
  const [projectSwitching, setProjectSwitching] = useState(false);

  // ---- Database States ----
  const [project, setProject] = useState<any>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [designPackages, setDesignPackages] = useState<any[]>([]);
  const [dailyReports, setDailyReports] = useState<any[]>([]);
  const [budgetHeads, setBudgetHeads] = useState<any[]>([]);
  const [subcontractors, setSubcontractors] = useState<any[]>([]);
  const [ipcSubmissions, setIpcSubmissions] = useState<any[]>([]);
  const [qaqc, setQaqc] = useState<any[]>([]);
  const [safety, setSafety] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [handover, setHandover] = useState<any[]>([]);
  const [defects, setDefects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [resourceUsage, setResourceUsage] = useState<any[]>([]);
  const [employeeVisits, setEmployeeVisits] = useState<any[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [allResourceUsage, setAllResourceUsage] = useState<any[]>([]);
  const [allEmployeeVisits, setAllEmployeeVisits] = useState<any[]>([]);

  // ---- Database loader ----
  const loadData = (expectedProjectId = storage.getActiveProjectId()) => {
    if (!isCurrentProject(expectedProjectId, storage.getActiveProjectId())) return;
    setProject(storage.getProject());
    setProjectsList(storage.getProjectsList());
    setActivities(storage.getActivities());
    setDependencies(storage.getDependencies());
    setDesignPackages(storage.getDesignPackages());
    setDailyReports(storage.getDailyReports());
    setBudgetHeads(storage.getBudgetHeads());
    setSubcontractors(storage.getSubcontractors());
    setIpcSubmissions(storage.getIPCs());
    setQaqc(storage.getQAQC());
    setSafety(storage.getSafetyLogs());
    setClaims(storage.getClaims());
    setHandover(storage.getHandoverChecklist());
    setDefects(storage.getDefects());
    setUsers(storage.getUsers());
    setExpenses(storage.getDailyExpenses());
    setResourceUsage(storage.getDailyResourceUsage());
    setEmployeeVisits(storage.getEmployeeVisits());
    setAllActivities(storage.getAllActivities());
    setAllExpenses(storage.getAllDailyExpenses());
    setAllResourceUsage(storage.getAllDailyResourceUsage());
    setAllEmployeeVisits(storage.getAllEmployeeVisits());
  };

  // Restore only sessions verified by Supabase or the signed HttpOnly demo
  // cookie. Browser storage is a display cache and is never an authority for
  // identity or role.
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const applyUser = async (candidate: AuthUser | null) => {
      let verified = candidate;
      if (candidate && storage.isSupabaseConfigured()) {
        const bootstrapped = await storage.bootstrapCloudWorkspace();
        if (bootstrapped.ok && 'user' in bootstrapped && bootstrapped.user) verified = bootstrapped.user;
      }
      if (!verified) verified = await storage.getVerifiedLocalDemoUser();
      if (!active) return;
      setAuthUser(verified);
      if (verified) localStorage.setItem('bt_auth_user', JSON.stringify(verified));
      else localStorage.removeItem('bt_auth_user');
      const requestedProjectId = projectIdFromUrl(window.location.search);
      if (requestedProjectId && storage.getMembershipForProject(requestedProjectId)) { storage.setActiveProjectId(requestedProjectId); setActiveProjectId(requestedProjectId); }
      loadData(storage.getActiveProjectId());
      setAuthChecked(true);
    };

    void (async () => {
      const cloudUser = storage.isSupabaseConfigured() ? await storage.getCurrentAuthUser() : null;
      await applyUser(cloudUser);
      if (!storage.isSupabaseConfigured()) return;
      unsubscribe = storage.onAuthStateChange(user => {
        void applyUser(user);
      });
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Keep shared records fresh across roles and devices. Writes remain
  // optimistic for field connectivity; focus/online events and a lightweight
  // interval reconcile the active project from the database.
  useEffect(() => {
    if (!authUser || !project?.id || !storage.isSupabaseConfigured()) return;
    let active = true;
    let refreshing = false;
    const refresh = async (allProjects = false) => {
      if (refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        if (allProjects) await storage.bootstrapCloudWorkspace();
        else await storage.pullActiveProjectFromCloud();
        if (active) loadData();
      } finally {
        refreshing = false;
      }
    };
    const onFocus = () => { void refresh(true); };
    const onOnline = () => { void refresh(false); };
    const timer = window.setInterval(() => { void refresh(false); }, 60_000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [authUser, project?.id]);

  // ---- Auth Handlers ----
  const handleAuthSuccess = async (user: AuthUser) => {
    storage.clearWorkspaceCache();
    let verified = user;
    const cloudSession = await storage.getAuthSession();
    if (cloudSession) {
      const bootstrapped = await storage.bootstrapCloudWorkspace();
      if (!bootstrapped.ok || !('user' in bootstrapped) || !bootstrapped.user) throw new Error(bootstrapped.message);
      verified = bootstrapped.user;
    }
    setAuthUser(verified);
    setActiveTab('dashboard');
    if (typeof window !== 'undefined') {
      localStorage.setItem('bt_auth_user', JSON.stringify(verified));
    }
    loadData();
  };

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bt_auth_user');
    }
    await storage.signOut();
    setAuthUser(null);
    setActiveTab('dashboard');
  };

  // ---- Show auth screen ----
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!authUser) {
    return <AuthLayout onAuthSuccess={handleAuthSuccess} />;
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="animate-pulse">Loading Command Center data...</div>
      </div>
    );
  }

  // ---- EVM metrics ----
  const evmMetrics: EVMMetrics = calculateEVM(
    project.contract_amount,
    activities,
    budgetHeads,
    ipcSubmissions,
    currentDate
  );

  // ---- Smart Alerts ----
  const getAlerts = () => {
    const alertsList: Array<{ type: string; message: string; severity: 'warning' | 'critical' | 'info' }> = [];

    activities.forEach(act => {
      if (act.is_critical && act.status !== 'completed') {
        if (diffDays(currentDate, act.baseline_start) > 0) {
          alertsList.push({
            type: 'Schedule',
            message: `Critical path activity "${act.name}" is behind baseline start!`,
            severity: 'critical',
          });
        }
      }
    });

    designPackages.forEach(dp => {
      if (dp.status !== 'approved' && dp.review_due_date && diffDays(dp.review_due_date, currentDate) > 0) {
        alertsList.push({
          type: 'Design',
          message: `Design Package "${dp.name}" review is overdue by ${diffDays(dp.review_due_date, currentDate)} days!`,
          severity: 'warning',
        });
      }
    });

    ipcSubmissions.forEach(ipc => {
      if (ipc.status === 'certified' && ipc.certified_date && diffDays(ipc.certified_date, currentDate) > 30) {
        alertsList.push({
          type: 'Cash Flow',
          message: `IPC #${ipc.ipc_number} is certified but remains unpaid beyond 30 days!`,
          severity: 'critical',
        });
      }
    });

    if (evmMetrics.forecastFinalCost > budgetHeads.reduce((s, b) => s + Number(b.internal_budget), 0)) {
      alertsList.push({
        type: 'Cost',
        message: 'Forecast project completion cost exceeds internal budget thresholds!',
        severity: 'warning',
      });
    }

    qaqc.forEach(q => {
      if (q.status === 'failed' && q.ncr_open_days > 7) {
        alertsList.push({
          type: 'Quality',
          message: `NCR "${q.ncr_number}" for item "${q.qa_item}" is open for more than 7 days!`,
          severity: 'critical',
        });
      }
    });

    const recentIncidents = safety.filter(s => s.log_date === currentDate && s.incidents > 0);
    if (recentIncidents.length > 0) {
      alertsList.push({
        type: 'Safety',
        message: 'Safety incident logged on site today! Immediate audit review required.',
        severity: 'critical',
      });
    }

    return alertsList;
  };

  const alerts = getAlerts();

  // ---- Action Handlers ----
  const handleUpdateActivity = (act: Activity) => { storage.updateActivity(act); loadData(); };
  const handleAddActivity = (activity: Omit<Activity, 'id' | 'status' | 'actual_quantity'>, predecessor?: { id: string; type: Dependency['type']; lag: number }) => {
    storage.addManualActivity(activity, predecessor);
    loadData();
  };
  const handleImportTender = async (result: Awaited<ReturnType<typeof import('../lib/ai').generateWbsFromTender>>) => {
    const prefix = `${project.id}-${Date.now()}`;
    const activityIds = new Map(result.activities.map(item => [item.id, `${prefix}-${item.id}`]));
    const activitiesWithUniqueIds = result.activities.map(item => ({ ...item, id: activityIds.get(item.id)! }));
    const dependenciesWithUniqueIds = result.dependencies.map((item, index) => ({
      ...item,
      id: `${prefix}-dep-${index + 1}`,
      predecessor_id: activityIds.get(item.predecessor_id) || item.predecessor_id,
      successor_id: activityIds.get(item.successor_id) || item.successor_id,
    }));
    const wbsWithUniqueIds = result.wbsItems.map((item, index) => ({ ...item, id: `${prefix}-wbs-${index + 1}` }));
    const imported = storage.applyGeneratedSchedule(wbsWithUniqueIds, activitiesWithUniqueIds, dependenciesWithUniqueIds);
    if (!imported.ok) throw new Error(imported.issues.join(' ') || 'The BOQ import was rejected to protect existing project records.');
    const sync = await storage.syncActiveProjectToCloud();
    if (!sync.ok) throw new Error(sync.message);
    loadData();
  };
  const handleAddDependency = (dep: any) => { storage.addDependency(dep); loadData(); };
  const handleDeleteDependency = (id: string) => { storage.deleteDependency(id); loadData(); };
  const handleUpdatePackage = (pkg: any) => { storage.updateDesignPackage(pkg); loadData(); };
  const handleAddComment = (cmt: any) => { storage.addDesignComment(cmt); loadData(); };
  const handleSubmitDailyReport = (rep: any, work: any[], mats: any[]) => { storage.submitDailyReport(rep, work, mats); loadData(); };
  const handleUpdateBudget = (bdg: any) => { storage.updateBudgetHead(bdg); loadData(); };
  const handleUpdateClaimStatus = (id: string, status: string) => { storage.updateClaim({ id, status }); loadData(); };
  const handleAddClaim = (clm: any) => { storage.addClaim(clm); loadData(); };
  const handleAddQAQC = (qa: any) => { storage.addQAQC(qa); loadData(); };
  const handleUpdateQAQC = (qa: any) => { storage.updateQAQC(qa); loadData(); };
  const handleAddSafetyLog = (sf: any) => { storage.addSafetyLog(sf); loadData(); };
  const handleAddUser = (usr: any) => { storage.addUser(usr); loadData(); };
  const handleUpdateProject = (proj: any) => { storage.updateProject(proj); loadData(); };
  const handleDeleteDailyReport = async (id: string) => { await storage.deleteDailyReport(id); loadData(); };

  const handleSwitchProject = async (id: string) => {
    if (!id || id === activeProjectId || projectSwitching) return;
    const switchTo = id; setProjectSwitching(true);
    storage.setActiveProjectId(id);
    setActiveProjectId(id); setProject(null);
    setActivities([]); setDependencies([]); setDesignPackages([]); setDailyReports([]); setBudgetHeads([]); setSubcontractors([]); setIpcSubmissions([]); setQaqc([]); setSafety([]); setClaims([]); setHandover([]); setDefects([]); setExpenses([]);
    window.history.pushState({}, '', workspaceUrl(window.location.href, id));
    setActiveTab('dashboard');
    const membership = storage.getMembershipForProject(id);
    try {
      if (membership) { const nextUser = { name: membership.name, email: membership.email, role: membership.role, feature_permissions: membership.feature_permissions || null }; setAuthUser(nextUser); localStorage.setItem('bt_auth_user', JSON.stringify(nextUser)); }
      await storage.pullActiveProjectFromCloud();
      if (isCurrentProject(switchTo, storage.getActiveProjectId())) loadData(switchTo);
    } finally { if (isCurrentProject(switchTo, storage.getActiveProjectId())) setProjectSwitching(false); }
  };

  const activePermissions = authUser.feature_permissions || storage.getMembershipForProject(project.id)?.feature_permissions || null;
  const canAccess = (feature: Feature, access: 'read' | 'write' = 'read') => can(authUser.role, feature, activePermissions, access);
  const isAllowedTab = (tab: ActiveTab) => isKnownTab(tab) && (tab === 'dashboard' || !TAB_FEATURES[tab] || canAccess(TAB_FEATURES[tab]!));
  const setActiveTabFromMenu = (tab: ActiveTab) => {
    if (isAllowedTab(tab)) setActiveTab(tab);
    setMobileMenuOpen(false);
  };
  const goToTab = (tab: string) => {
    setActiveTab(isKnownTab(tab) && isAllowedTab(tab) ? tab : 'dashboard');
    setMobileMenuOpen(false);
  };
  const activeModule = moduleForTab(activeTab);
  const visibleViews = activeModule?.views.filter(view => isAllowedTab(view.tab)) || [];
  const homeEntries = MANAGEMENT_MODULES.filter(module => !['home', 'projects', 'settings'].includes(module.id)).flatMap(module => {
    const firstAccessible = module.views.find(view => isAllowedTab(view.tab));
    const description: Record<string, string> = {
      people: 'Assignments and workforce', work: 'Tasks, schedule and daily work', fleet: 'Equipment and usage',
      inventory: 'Stock and movements', purchases: 'Orders and suppliers', commercial: 'Costs, billing and contracts',
      'quality-safety': 'Inspections and incidents', 'document-vault': 'Documents and evidence', reports: 'Reports and analysis',
    };
    return firstAccessible ? [{ label: module.label, icon: module.icon, tab: firstAccessible.tab, description: description[module.id] || module.label }] : [];
  });
  const activeFeature = TAB_FEATURES[activeTab];
  const isReadOnlyFeature = Boolean(activeFeature && canAccess(activeFeature, 'read') && !canAccess(activeFeature, 'write'));

  return (
    <div className="app-shell min-h-screen flex flex-col md:flex-row font-sans">
      {/* Create Project Modal */}
      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={loadData}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SIDEBAR NAVIGATION                                                   */}
      {/* ------------------------------------------------------------------ */}
      {mobileMenuOpen && <button aria-label="Close menu overlay" className="app-menu-overlay fixed inset-0 z-30 bg-black/45 md:hidden" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-40 w-[86vw] max-w-80 border-r flex flex-col shrink-0 transition-transform duration-200 md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center font-extrabold shadow-sm">B</span>
            <div>
              <span className="font-extrabold text-slate-950 text-base tracking-tight">BuildTrack</span>
              <span className="block text-xs font-medium text-slate-500">Construction management</span>
            </div>
          </div>
        </div>

        {/* Signed-in user badge */}
        <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-800 shrink-0">
              {authUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950 truncate">{authUser.name}</p>
              <p className="text-xs text-slate-500 truncate">{ROLE_LABELS[normalizeRole(authUser.role)]}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="shrink-0 text-xs text-slate-600 hover:text-rose-700 font-semibold transition focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Sign out
          </button>
        </div>

        {/* Tab Links */}
        <nav aria-label="Primary navigation" className="flex-1 p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-180px)]">
          <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-500">Management</p>
          {MANAGEMENT_MODULES.map(module => {
            const firstAccessible = module.views.find(view => isAllowedTab(view.tab));
            return firstAccessible ? <NavBtn key={module.id} tab={firstAccessible.tab} active={activeModule?.id === module.id} setActiveTab={setActiveTabFromMenu} icon={module.icon} label={module.label} /> : null;
          })}
        </nav>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN CONTENT AREA                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header toolbar */}
        <header className="app-header min-h-16 border-b flex items-center justify-between px-4 py-2 md:px-6 shrink-0 text-xs gap-2">
          {/* Left: Project switcher */}
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setMobileMenuOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-lg font-bold text-slate-700 shadow-sm md:hidden" aria-label="Open menu">
              ☰
            </button>
            {authUser.role === 'super_admin' ? (
              <span className="rounded-lg bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700">Platform Subscription Console</span>
            ) : <>
              <select
                value={activeProjectId}
                onChange={(e) => { void handleSwitchProject(e.target.value); }}
                disabled={projectSwitching}
                aria-label="Current project"
                className="bg-white border border-slate-300 px-3 py-2 rounded-lg text-sm text-slate-900 font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 max-w-[150px] md:max-w-[300px] truncate"
              >
                {projectsList.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {canAccess('manage_projects', 'write') && <button
                onClick={() => setShowCreateProject(true)}
                className="px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                + New Project
              </button>}
            </>}
          </div>

          {/* Right: DB status + date + role switcher */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1 text-slate-500 hidden lg:flex">
              <span>📅</span>
              <span className="font-mono">{formatBsDate(currentDate, { long: true })}</span>
            </div>

            <button onClick={() => setActiveTabFromMenu('notifications')} className="relative rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg text-slate-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600" aria-label="Open notifications">
              🔔
            </button>

            {/* Role indicator */}
            <div className="hidden items-center gap-1.5 lg:flex">
              <span className="bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full text-xs text-blue-800 font-bold capitalize">
                {ROLE_LABELS[normalizeRole(authUser.role)]}
              </span>
            </div>
          </div>
        </header>

        {/* ---- Active Dashboard Panel ---- */}
        <main className="app-main flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto max-h-[calc(100vh-64px)]">
          {activeModule && !['home', 'projects'].includes(activeModule.id) && <p className="mb-4 text-xs font-semibold text-slate-500" aria-label="Current location">{project.name} <span aria-hidden="true">/</span> <span className="text-slate-800">{activeModule.label}</span>{activeModule.views.length > 1 && <span> / {activeModule.views.find(view => view.tab === activeTab)?.label}</span>}</p>}
          {activeModule && visibleViews.length > 1 && (
            <nav aria-label={`${activeModule.label} sections`} className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {visibleViews.map(view => <button key={view.tab} type="button" onClick={() => setActiveTabFromMenu(view.tab)} aria-current={activeTab === view.tab ? 'page' : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${activeTab === view.tab ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 hover:bg-blue-50'}`}>{view.label}</button>)}
            </nav>
          )}
          {isReadOnlyFeature && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">Your Project Director granted view-only access to this module. Editing and uploads are disabled.</div>}
          <div className={isReadOnlyFeature ? 'feature-read-only' : ''} aria-readonly={isReadOnlyFeature}>
          {activeModule && !['inventory', 'purchases'].includes(activeModule.id) && visibleViews[0]?.tab === activeTab && <ModuleSnapshot moduleId={activeModule.id} projectName={project.name} contractAmount={Number(project.contract_amount || 0)} activities={activities} expenses={expenses} resourceUsage={resourceUsage} employeeVisits={employeeVisits} peopleCount={users.length} ipcCount={ipcSubmissions.length} qaqcCount={qaqc.length} safetyCount={safety.length} defectsCount={defects.length} today={currentDate} canSeeFinancialSummary={canAccess('budget') && canAccess('expenses')} />}
          {activeTab === 'dashboard' && (
            authUser.role === 'super_admin' ? (
              <SuperAdminDashboard />
            ) : (
              <ManagementHome
                projects={projectsList}
                currentProject={project}
                activities={normalizeRole(authUser.role) === 'project_director' ? allActivities : activities}
                expenses={normalizeRole(authUser.role) === 'project_director' ? allExpenses : expenses}
                resourceUsage={resourceUsage}
                usersCount={users.length}
                alerts={alerts}
                entries={homeEntries}
                portfolio={normalizeRole(authUser.role) === 'project_director'}
                canSeeCommercial={canAccess('budget') && canAccess('expenses')}
                onNavigate={goToTab}
              />
            )
          )}

          {activeTab === 'projects' && (
            <section className="space-y-7">
              <PageHeader eyebrow="Projects" title="Your projects" description="Choose a project to see its work, people and finances. Records always follow the selected project." action={canAccess('manage_projects', 'write') ? <button type="button" onClick={() => setShowCreateProject(true)} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">+ New project</button> : undefined} />
              <ProjectOverview project={project} activities={normalizeRole(authUser.role) === 'project_director' ? allActivities : activities} expenses={normalizeRole(authUser.role) === 'project_director' ? allExpenses : expenses} resources={normalizeRole(authUser.role) === 'project_director' ? allResourceUsage : resourceUsage} entries={homeEntries} canSeeCommercial={canAccess('budget') && canAccess('expenses')} onNavigate={goToTab} />
              <div className="space-y-3"><SectionHeader title="Project list" description="Select a project to make it your active workspace." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{projectsList.map((item: any) => <button type="button" key={item.id} onClick={() => { void handleSwitchProject(item.id); }} disabled={projectSwitching} aria-current={item.id === project.id ? 'page' : undefined} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600 ${item.id === project.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}><span className="flex items-start justify-between gap-3"><span className="font-semibold text-slate-950">{item.name}</span><span className="text-xs font-semibold text-slate-600">{item.status || 'Active'}</span></span><span className="mt-2 block text-sm text-slate-600">{[item.client, item.location].filter(Boolean).join(' · ') || 'Project workspace'}</span><span className="mt-4 block text-sm font-semibold text-blue-800">{item.id === project.id ? 'Current project' : 'Open project →'}</span></button>)}</div></div>
              {normalizeRole(authUser.role) === 'project_director' && <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-blue-800">Portfolio controls and archived projects</summary><div className="mt-5"><DirectorPortfolioDashboard projects={projectsList} activeProjectId={project.id} activities={allActivities} expenses={allExpenses} resourceUsage={allResourceUsage} visits={allEmployeeVisits} alerts={alerts} onSwitchProject={handleSwitchProject} onNavigate={goToTab} onReload={loadData} /></div></details>}
            </section>
          )}

          {activeTab === 'people' && <PeopleHub projectId={project.id} canManage={canAccess('manage_users', 'write')} onNavigate={goToTab} />}
          {activeTab === 'workforce' && <OperationalControlDashboard key={`workforce-${project.id}`} projectId={project.id} role={authUser.role} userName={authUser.name} activities={activities} />}
          {activeTab === 'work' && <WorkHub projectId={project.id} activities={activities} onNavigate={goToTab} onRefresh={loadData} />}
          {activeTab === 'departments' && <DepartmentHub projectId={project.id} activities={activities} canManage={canAccess('manage_users', 'write')} onNavigate={goToTab} />}
          {activeTab === 'notifications' && <AlertHub projectId={project.id} onNavigate={goToTab} />}

          {activeTab === 'cpm' && (
            <CpmTimelineDashboard
              activities={activities}
              dependencies={dependencies}
              project={project}
              onAddDependency={handleAddDependency}
              onDeleteDependency={handleDeleteDependency}
              onUpdateActivity={handleUpdateActivity}
              onAddActivity={handleAddActivity}
              onImportTender={handleImportTender}
              userRole={authUser.role}
            />
          )}

          {activeTab === 'expected_actual' && (
            <ExpectedActualDashboard
              activities={activities}
              evm={evmMetrics}
              designPackages={designPackages}
              budgetHeads={budgetHeads}
              ipcSubmissions={ipcSubmissions}
              currentDate={currentDate}
            />
          )}

          {activeTab === 'daily' && (
            <DailyReportingDashboard
              key={project.id}
              projectId={project.id}
              activities={activities}
              reports={dailyReports}
              currentDate={currentDate}
              userName={authUser.name}
              userEmail={authUser.email}
              userRole={authUser.role}
              onSubmit={handleSubmitDailyReport}
              onReload={loadData}
              onDelete={handleDeleteDailyReport}
            />
          )}

          {activeTab === 'operations' && (
            <OperationalControlDashboard key={project.id} projectId={project.id} role={authUser.role} userName={authUser.name} activities={activities} />
          )}

          {activeTab === 'evidence' && (
            <EvidenceVault key={project.id} projectId={project.id} role={authUser.role} />
          )}

          {activeTab === 'design' && (
            <DesignDashboard
              designPackages={designPackages}
              onAddComment={handleAddComment}
              onUpdatePackage={handleUpdatePackage}
              getComments={storage.getDesignComments}
              userRole={authUser.role}
            />
          )}

          {activeTab === 'budget' && (
            <BudgetDashboard
              key={`cost-control-${project.id}`}
              projectId={project.id}
              budgetHeads={budgetHeads}
              subcontractors={subcontractors}
              evm={evmMetrics}
              onUpdateBudget={handleUpdateBudget}
              userRole={authUser.role}
            />
          )}

          {activeTab === 'ipc' && (
            <div className="space-y-6">
              <IpcValuationWorkspace key={`valuation-${project.id}`} projectId={project.id} role={authUser.role} />
              <PaymentCertificateWorkspace key={`certificate-${project.id}`} projectId={project.id} role={authUser.role} />
              <IpcDashboard
                key={project.id}
                ipcSubmissions={ipcSubmissions}
                userRole={authUser.role}
                userName={authUser.name}
                userEmail={authUser.email}
                onRefresh={loadData}
              />
            </div>
          )}

          {activeTab === 'claims' && <CommercialControlWorkspace key={`commercial-${project.id}`} projectId={project.id} role={authUser.role} />}

          {(activeTab === 'procurement' || activeTab === 'stores') && (
            <ProcurementStoresDashboard key={`${project.id}-${activeTab}`} projectId={project.id} initialView={activeTab === 'stores' ? 'stores' : 'procurement'} />
          )}

          {activeTab === 'obligations' && (
            <ContractObligationsDashboard key={project.id} projectId={project.id} userName={authUser.name} />
          )}

          {activeTab === 'qaqc' && (
            <QaqcDashboard
              qaqc={qaqc}
              onAddQAQC={handleAddQAQC}
              onUpdateQAQC={handleUpdateQAQC}
              userRole={authUser.role}
            />
          )}

          {activeTab === 'safety' && (
            <SafetyDashboard
              safetyLogs={safety}
              onAddSafetyLog={handleAddSafetyLog}
              userRole={authUser.role}
            />
          )}

          {activeTab === 'expenses' && (
            <DailyExpenseDashboard key={project.id} projectId={project.id} userName={authUser.name} userEmail={authUser.email} userRole={authUser.role} activities={activities} />
          )}

          {/* ---- NEW: Document Registry ---- */}
          {activeTab === 'documents' && (
            <div className="space-y-6" key={project.id}>
              <DocumentVault projectId={project.id} />
              <DocumentTracker userRole={authUser.role} projectId={project.id} userName={authUser.name} userEmail={authUser.email} />
            </div>
          )}

          {activeTab === 'reports' && (
            <ReportCenter key={project.id} projectId={project.id} />
          )}

          {activeTab === 'handover' && (
            <HandoverDashboard
              handoverList={handover}
              userRole={authUser.role}
              userName={authUser.name}
              onReload={loadData}
            />
          )}

          {activeTab === 'defects' && (
            <DefectsDashboard
              defectsList={defects}
              userRole={authUser.role}
              userName={authUser.name}
              activities={activities}
              onReload={loadData}
            />
          )}

          {activeTab === 'subscription' && <SubscriptionDashboard />}

          {activeTab === 'settings' && (
            <SettingsPanel
              users={users}
              onAddUser={handleAddUser}
              onResetDb={storage.resetDatabase}
              project={project}
              onUpdateProject={handleUpdateProject}
              userRole={authUser.role}
              onUsersChanged={loadData}
            />
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
