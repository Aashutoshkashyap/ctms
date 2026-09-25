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
import ClaimsDashboard from '../components/ClaimsDashboard';
import QaqcDashboard from '../components/QaqcDashboard';
import SafetyDashboard from '../components/SafetyDashboard';
import HandoverDashboard from '../components/HandoverDashboard';
import DefectsDashboard from '../components/DefectsDashboard';
import SettingsPanel from '../components/SettingsPanel';
import AuthLayout from '../components/AuthLayout';
import DocumentTracker from '../components/DocumentTracker';
import ProcurementStoresDashboard from '../components/ProcurementStoresDashboard';
import ContractObligationsDashboard from '../components/ContractObligationsDashboard';
import DailyReportingDashboard from '../components/DailyReportingDashboard';
import ReportCenter from '../components/ReportCenter';
import DailyExpenseDashboard from '../components/DailyExpenseDashboard';
import RoleDashboard from '../components/RoleDashboard';
import OperationalControlDashboard from '../components/OperationalControlDashboard';
import EvidenceVault from '../components/EvidenceVault';
import DirectorPortfolioDashboard from '../components/DirectorPortfolioDashboard';
import SuperAdminDashboard from '../components/SuperAdminDashboard';
import SubscriptionDashboard from '../components/SubscriptionDashboard';
import BsDatePicker from '../components/BsDatePicker';
import IpcValuationWorkspace from '../components/IpcValuationWorkspace';
import PaymentCertificateWorkspace from '../components/PaymentCertificateWorkspace';
import { formatBsDate } from '../lib/nepaliDate';
import { can, ROLE_LABELS, normalizeRole } from '../lib/permissions';
import type { Feature, FeaturePermissions } from '../lib/permissions';

type ActiveTab =
  | 'dashboard' | 'cpm' | 'expected_actual'
  | 'design' | 'budget' | 'ipc' | 'claims'
  | 'qaqc' | 'safety'
  | 'handover' | 'defects'
  | 'documents'
  | 'procurement' | 'obligations' | 'daily' | 'reports' | 'expenses'
  | 'operations' | 'evidence' | 'subscription'
  | 'settings';

const TAB_FEATURES: Partial<Record<ActiveTab, Feature>> = {
  cpm: 'schedule', expected_actual: 'schedule', daily: 'daily_reports',
  operations: 'operations', evidence: 'view_evidence', design: 'design', budget: 'budget',
  ipc: 'ipc', claims: 'claims', procurement: 'procurement', obligations: 'obligations',
  qaqc: 'qaqc', safety: 'safety', expenses: 'expenses',
  documents: 'documents', reports: 'reports', handover: 'handover', defects: 'defects',
  subscription: 'subscription', settings: 'settings',
};

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-900">Create New Project</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pokhara Airport Access Road (D&B)"
              className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Contract Start Date</label>
              <BsDatePicker value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Duration (Days)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Contract Amount (NPR)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow transition"
            >
              {submitting ? 'Creating…' : 'Create Project'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition"
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
  activeTab,
  setActiveTab,
  icon,
  label,
  accent,
}: {
  tab: ActiveTab;
  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;
  icon: string;
  label: string;
  accent?: 'purple' | 'emerald';
}) {
  const isActive = activeTab === tab;
  const base = 'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition';
  const styles = isActive
    ? accent === 'purple'
      ? `${base} bg-purple-700 text-white shadow-lg`
      : accent === 'emerald'
      ? `${base} bg-emerald-700 text-white shadow-lg`
      : `${base} bg-blue-600 text-white shadow-lg`
    : accent === 'purple'
    ? `${base} text-purple-700 hover:bg-purple-50`
    : accent === 'emerald'
    ? `${base} text-emerald-700 hover:bg-emerald-50`
    : `${base} text-slate-600 hover:bg-blue-50 hover:text-blue-700`;

  return (
    <button onClick={() => setActiveTab(tab)} className={styles}>
      {icon} {label}
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
  const loadData = () => {
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
      loadData();
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
    storage.applyGeneratedSchedule(wbsWithUniqueIds, activitiesWithUniqueIds, dependenciesWithUniqueIds);
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
    storage.setActiveProjectId(id);
    setActiveTab('dashboard');
    const membership = storage.getMembershipForProject(id);
    if (membership) {
      const nextUser = { name: membership.name, email: membership.email, role: membership.role, feature_permissions: membership.feature_permissions || null };
      setAuthUser(nextUser);
      localStorage.setItem('bt_auth_user', JSON.stringify(nextUser));
    }
    await storage.pullActiveProjectFromCloud();
    loadData();
  };

  const activePermissions = authUser.feature_permissions || storage.getMembershipForProject(project.id)?.feature_permissions || null;
  const canAccess = (feature: Feature, access: 'read' | 'write' = 'read') => can(authUser.role, feature, activePermissions, access);
  const isAllowedTab = (tab: ActiveTab) => tab === 'dashboard' || !TAB_FEATURES[tab] || canAccess(TAB_FEATURES[tab]!);
  const setActiveTabFromMenu = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };
  const goToTab = (tab: string) => {
    const next = tab as ActiveTab;
    setActiveTab(isAllowedTab(next) ? next : 'dashboard');
    setMobileMenuOpen(false);
  };
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
      <aside className={`app-sidebar fixed inset-y-0 left-0 z-40 w-[86vw] max-w-80 border-r flex flex-col shrink-0 transition-transform duration-200 md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">B</span>
            <div>
              <span className="font-extrabold text-slate-100 text-sm tracking-tight">BuildTrack D&amp;B</span>
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Project Control System</span>
            </div>
          </div>
          <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">v1.3</span>
        </div>

        {/* Signed-in user badge */}
        <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
              {authUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-200 truncate max-w-[110px]">{authUser.name}</p>
              <p className="text-[9px] text-slate-500 capitalize">{authUser.role.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-[9px] text-slate-500 hover:text-rose-400 font-semibold transition"
          >
            Sign Out
          </button>
        </div>

        {/* Tab Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-180px)]">
          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 mb-1.5 tracking-wider">Project Operations</div>
          <NavBtn tab="dashboard" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📊" label="My Dashboard" />
          {canAccess('schedule') && <NavBtn tab="cpm" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📅" label="BOQ & Work Schedule" />}
          {canAccess('schedule') && <NavBtn tab="expected_actual" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📈" label="Expected vs Actual" />}
          {canAccess('daily_reports') && <NavBtn tab="daily" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📝" label="Daily Site Reporting" />}
          {canAccess('operations') && <NavBtn tab="operations" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🚜" label="Resources & Productivity" />}
          {canAccess('view_evidence') && <NavBtn tab="evidence" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🖼️" label="Director Evidence Vault" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Engineering & Controls</div>
          {canAccess('budget') && <NavBtn tab="budget" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="💰" label="Budget & Costs" />}
          {canAccess('ipc') && <NavBtn tab="ipc" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🧾" label="IPC Billing / Valuation" />}
          {canAccess('claims') && <NavBtn tab="claims" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="⚖️" label="Variations & Claims" />}
          {canAccess('procurement') && <NavBtn tab="procurement" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🚚" label="Procurement & Stores" />}
          {canAccess('obligations') && <NavBtn tab="obligations" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="⏰" label="Contract Obligations" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Site Quality & Safety</div>
          {canAccess('qaqc') && <NavBtn tab="qaqc" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🧪" label="QA / QC Inspections" />}
          {canAccess('safety') && <NavBtn tab="safety" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🦺" label="Safety / EHS Logs" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Finance & Documents</div>
          {canAccess('expenses') && <NavBtn tab="expenses" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🧾" label="Daily Expense Register" accent="emerald" />}
          {canAccess('documents') && <NavBtn tab="documents" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📁" label="Compliance & Documents" accent="emerald" />}
          {canAccess('reports') && <NavBtn tab="reports" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📤" label="Reports & Exports" accent="emerald" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Completion Dossier</div>
          {canAccess('handover') && <NavBtn tab="handover" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🔑" label="Handover Checklist" />}
          {canAccess('defects') && <NavBtn tab="defects" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🔧" label="Defects Maintenance" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Account & Setup</div>
          {canAccess('subscription') && <NavBtn tab="subscription" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🧾" label="Service & Billing" accent="purple" />}
          {canAccess('settings') && <NavBtn tab="settings" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="⚙️" label="System Settings" />}
        </nav>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN CONTENT AREA                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header toolbar */}
        <header className="app-header h-14 border-b flex items-center justify-between px-4 shrink-0 text-xs gap-2">
          {/* Left: Project switcher */}
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setMobileMenuOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-lg font-bold text-slate-700 shadow-sm md:hidden" aria-label="Open menu">
              ☰
            </button>
            {authUser.role === 'super_admin' ? (
              <span className="rounded-lg bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700">Platform Subscription Console</span>
            ) : <>
              <select
                value={project.id}
                onChange={(e) => { void handleSwitchProject(e.target.value); }}
                className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 font-semibold focus:outline-none max-w-[180px] md:max-w-[300px] truncate"
              >
                {projectsList.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {canAccess('manage_projects', 'write') && <button
                onClick={() => setShowCreateProject(true)}
                className="px-2 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-[10px] font-bold rounded transition whitespace-nowrap"
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

            {/* Role indicator */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 hidden sm:inline">Role:</span>
              <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[10px] text-blue-400 font-bold capitalize">
                {ROLE_LABELS[normalizeRole(authUser.role)]}
              </span>
            </div>
          </div>
        </header>

        {/* ---- Active Dashboard Panel ---- */}
        <main className="app-main flex-1 p-4 md:p-6 overflow-y-auto max-h-[calc(100vh-56px)]">
          {isReadOnlyFeature && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">Your Project Director granted view-only access to this module. Editing and uploads are disabled.</div>}
          <div className={isReadOnlyFeature ? 'feature-read-only' : ''} aria-readonly={isReadOnlyFeature}>
          {activeTab === 'dashboard' && (
            authUser.role === 'project_director' ? (
              <DirectorPortfolioDashboard
                projects={projectsList}
                activeProjectId={project.id}
                activities={allActivities}
                expenses={allExpenses}
                resourceUsage={allResourceUsage}
                visits={allEmployeeVisits}
                alerts={alerts}
                onSwitchProject={handleSwitchProject}
                onNavigate={goToTab}
                onReload={loadData}
              />
            ) : authUser.role === 'super_admin' ? (
              <SuperAdminDashboard />
            ) : (
              <RoleDashboard
                role={authUser.role}
                userName={authUser.name}
                project={project}
                activities={activities}
                expenses={expenses}
                resourceUsage={resourceUsage}
                visits={employeeVisits}
                alerts={alerts}
                onNavigate={goToTab}
                featurePermissions={activePermissions}
              />
            )
          )}

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

          {activeTab === 'claims' && (
            <ClaimsDashboard
              claims={claims}
              onAddClaim={handleAddClaim}
              onUpdateClaimStatus={handleUpdateClaimStatus}
              userRole={authUser.role}
            />
          )}

          {activeTab === 'procurement' && (
            <ProcurementStoresDashboard key={project.id} projectId={project.id} />
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
            <DocumentTracker key={project.id} userRole={authUser.role} projectId={project.id} userName={authUser.name} userEmail={authUser.email} />
          )}

          {activeTab === 'reports' && (
            <ReportCenter
              project={project}
              activities={activities}
              evm={evmMetrics}
              dailyReports={dailyReports}
              ipc={ipcSubmissions}
              claims={claims}
              qaqc={qaqc}
              safety={safety}
              handover={handover}
              userRole={authUser.role}
            />
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
