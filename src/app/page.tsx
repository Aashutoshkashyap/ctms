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
import EmployeeWorkforceDashboard from '../components/EmployeeWorkforceDashboard';
import BsDatePicker from '../components/BsDatePicker';
import BoqMeasurementDashboard from '../components/BoqMeasurementDashboard';
import IpcValuationWorkspace from '../components/IpcValuationWorkspace';
import PaymentCertificateWorkspace from '../components/PaymentCertificateWorkspace';
import { formatBsDate } from '../lib/nepaliDate';
import { useLanguage } from '../components/LanguageProvider';
import { saveDailyWorkUpdate } from '../lib/dailyWorkUpdate';
import { mayRefreshWorkspace, needsPortfolioCollections } from '../lib/lowBandwidth';
import { isCurrentProject, projectIdFromUrl, workspaceUrl } from '../lib/projectContext';
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
  | 'workforce'
  | 'measurements'
  | 'settings';

const ACTIVE_TABS: ActiveTab[] = ['dashboard', 'cpm', 'expected_actual', 'design', 'budget', 'ipc', 'claims', 'qaqc', 'safety', 'handover', 'defects', 'documents', 'procurement', 'obligations', 'daily', 'reports', 'expenses', 'operations', 'evidence', 'subscription', 'workforce', 'measurements', 'settings'];
const TAB_TITLES: Record<ActiveTab, { title: string; description: string }> = {
  dashboard: { title: 'My dashboard', description: 'Your role-specific project workspace.' },
  cpm: { title: 'BOQ & work schedule', description: 'Programme, activity progress and delay information.' },
  expected_actual: { title: 'Expected vs actual', description: 'Programme and delivery comparison.' },
  design: { title: 'Design control', description: 'Drawings, submissions and design records.' }, budget: { title: 'Budget & costs', description: 'Project budget and cost controls.' },
  ipc: { title: 'IPC billing / valuation', description: 'Measurements, valuations and payment status.' }, claims: { title: 'Variations & claims', description: 'Commercial actions and claim records.' },
  qaqc: { title: 'QA / QC inspections', description: 'Inspections, tests and outstanding actions.' }, safety: { title: 'Safety / EHS', description: 'Safety inspections, incidents and corrective actions.' },
  handover: { title: 'Handover checklist', description: 'Completion records and handover readiness.' }, defects: { title: 'Defects maintenance', description: 'Defects and maintenance actions.' },
  documents: { title: 'Compliance & documents', description: 'Project documents and compliance records.' }, procurement: { title: 'Procurement & stores', description: 'Orders, deliveries, stock and resource records.' },
  obligations: { title: 'Contract obligations', description: 'Commitments, due dates and contractual actions.' },
  daily: { title: 'Daily site reporting', description: 'Today’s work, quantities, issues and evidence.' }, reports: { title: 'Reports & exports', description: 'Project reporting and downloadable summaries.' },
  expenses: { title: 'Daily expense register', description: 'Site expense records and approvals.' }, operations: { title: 'Resources & productivity', description: 'Manpower, equipment, fuel and site visits.' },
  evidence: { title: 'Director evidence vault', description: 'Private verification photographs and files.' }, subscription: { title: 'Service & billing', description: 'Subscription, validity and transaction history.' },
  workforce: { title: 'Employee & workforce', description: 'Organization employee records and project team deployment.' },
  measurements: { title: 'BOQ measurement', description: 'Measured and approved quantities against BOQ work items.' },
  settings: { title: 'System settings', description: 'Project setup, people and access.' },
};

function tabFromUrl(): ActiveTab {
  if (typeof window === 'undefined') return 'dashboard';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return ACTIVE_TABS.includes(tab as ActiveTab) ? tab as ActiveTab : 'dashboard';
}

const TAB_FEATURES: Partial<Record<ActiveTab, Feature>> = {
  cpm: 'schedule', expected_actual: 'schedule', daily: 'daily_reports',
  operations: 'operations', evidence: 'view_evidence', design: 'design', budget: 'budget',
  ipc: 'ipc', claims: 'claims', procurement: 'procurement', obligations: 'obligations',
  qaqc: 'qaqc', safety: 'safety', expenses: 'expenses',
  documents: 'documents', reports: 'reports', handover: 'handover', defects: 'defects',
  subscription: 'subscription', workforce: 'manage_users', measurements: 'schedule', settings: 'settings',
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
// ---------------------------------------------------------------------------
// Sidebar Nav Button helper (Consistent vibrant blue pill on deep navy)
// ---------------------------------------------------------------------------
function NavBtn({
  tab,
  activeTab,
  setActiveTab,
  icon,
  label,
  badge,
  accent,
}: {
  tab: ActiveTab;
  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;
  icon: string | React.ReactNode;
  label: string;
  badge?: number | string;
  accent?: 'purple' | 'emerald';
}) {
  const isActive = activeTab === tab;
  const base = 'w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-150 group';
  const styles = isActive
    ? accent === 'purple'
      ? `${base} bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/40 font-bold ring-1 ring-purple-400/40`
      : accent === 'emerald'
      ? `${base} bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/40 font-bold ring-1 ring-emerald-400/40`
      : `${base} bg-blue-600 text-white shadow-md shadow-blue-900/50 font-bold ring-1 ring-blue-400/30`
    : 'w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all duration-150';

  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={styles}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className="flex items-center gap-2.5 truncate">
        <span className={`w-5 h-5 flex items-center justify-center text-sm shrink-0 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-105 opacity-80 group-hover:opacity-100'}`}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {badge !== undefined && (
        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main App Shell
// ---------------------------------------------------------------------------
export default function DashboardShell() {
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<ActiveTab>(tabFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
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
  const [ipcPayments, setIpcPayments] = useState<any[]>([]);
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
  const [isOnline, setIsOnline] = useState(true);
  const [syncSummary, setSyncSummary] = useState({ pending: 0, conflicts: 0, lastError: undefined as string | undefined });

  const refreshSyncSummary = () => {
    if (storage.isSupabaseConfigured()) setSyncSummary(storage.getDurableSyncSummary());
  };

  useEffect(() => {
    const onPopState = () => setActiveTab(tabFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ---- Database loader ----
  const loadData = (role = authUser?.role, expectedProjectId = storage.getActiveProjectId()) => {
    // A late cloud pull for Project A must never repopulate the UI after the
    // user selected Project B.
    if (!isCurrentProject(expectedProjectId, storage.getActiveProjectId())) return;
    setNotifications(storage.getAllNotifications(20));
    setProject(storage.getProject());
    setProjectsList(storage.getProjectsList());
    setActivities(storage.getActivities());
    setDependencies(storage.getDependencies());
    setDesignPackages(storage.getDesignPackages());
    setDailyReports(storage.getDailyReports());
    setBudgetHeads(storage.getBudgetHeads());
    setSubcontractors(storage.getSubcontractors());
    setIpcSubmissions(storage.getIPCs());
    setIpcPayments(storage.getIPCPayments());
    setQaqc(storage.getQAQC());
    setSafety(storage.getSafetyLogs());
    setClaims(storage.getClaims());
    setHandover(storage.getHandoverChecklist());
    setDefects(storage.getDefects());
    setUsers(storage.getUsers());
    setExpenses(storage.getDailyExpenses());
    setResourceUsage(storage.getDailyResourceUsage());
    setEmployeeVisits(storage.getEmployeeVisits());
    // Portfolio-wide collections are only consumed by the Director dashboard.
    // Avoid rebuilding those large client-side lists for every field workflow.
    if (needsPortfolioCollections(role)) {
      setAllActivities(storage.getAllActivities());
      setAllExpenses(storage.getAllDailyExpenses());
      setAllResourceUsage(storage.getAllDailyResourceUsage());
      setAllEmployeeVisits(storage.getAllEmployeeVisits());
    } else {
      setAllActivities([]); setAllExpenses([]); setAllResourceUsage([]); setAllEmployeeVisits([]);
    }
  };

  useEffect(() => {
    const updateConnection = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine && storage.isSupabaseConfigured()) {
        void storage.flushDurableMutations(storage.getActiveProjectId()).finally(refreshSyncSummary);
      }
    };
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

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
      if (verified && storage.isSupabaseConfigured()) await storage.flushDurableMutations(storage.getActiveProjectId());
      const requestedProjectId = projectIdFromUrl(window.location.search);
      if (requestedProjectId && storage.getMembershipForProject(requestedProjectId)) {
        storage.setActiveProjectId(requestedProjectId);
        setActiveProjectId(requestedProjectId);
      }
      loadData(verified?.role, storage.getActiveProjectId());
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

  // Keep shared records fresh without constantly re-downloading data in a
  // background or active data-entry session. The daily form owns its retry
  // path so a failed field submission is not overwritten by an auto-pull.
  useEffect(() => {
    if (!authUser || !project?.id || !storage.isSupabaseConfigured() || activeTab === 'daily') return;
    let active = true;
    let refreshing = false;
    const refresh = async (allProjects = false) => {
      if (refreshing || !mayRefreshWorkspace({ online: navigator.onLine, visible: document.visibilityState === 'visible', activeTab })) return;
      refreshing = true;
      try {
        await storage.flushDurableMutations(project.id);
        if (allProjects) await storage.bootstrapCloudWorkspace();
        else await storage.pullActiveProjectFromCloud();
        if (active) loadData();
      } finally {
        refreshing = false;
      }
    };
    const onFocus = () => { void refresh(false); };
    const onOnline = () => { void refresh(false); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(false); };
    const timer = window.setInterval(() => { void refresh(false); }, 180_000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authUser, project?.id, activeTab]);

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
    loadData(verified.role);
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
    currentDate,
    { claims, expenses, ipcPayments }
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
    const imported = await storage.importBoqSchedule({
      projectId: project.id,
      wbs: wbsWithUniqueIds,
      activities: activitiesWithUniqueIds,
      dependencies: dependenciesWithUniqueIds,
    });
    if (!imported.ok) throw new Error(imported.issues.map(issue => issue.message).join(' ') || 'The BOQ import could not be completed.');
    loadData();
  };
  const handleAddDependency = (dep: any) => { storage.addDependency(dep); loadData(); };
  const handleDeleteDependency = (id: string) => { storage.deleteDependency(id); loadData(); };
  const handleUpdatePackage = (pkg: any) => { storage.updateDesignPackage(pkg); loadData(); };
  const handleAddComment = (cmt: any) => { storage.addDesignComment(cmt); loadData(); };
  const handleSubmitDailyReport = async (rep: any, work: any[], mats: any[], operationId?: string) => {
    try {
      await saveDailyWorkUpdate({ projectId: project.id, report: rep, workItems: work, materialItems: mats, operationId });
      loadData();
    } finally {
      refreshSyncSummary();
    }
  };
  const handleUpdateBudget = (bdg: any) => { storage.updateBudgetHead(bdg); loadData(); };
  const handleUpdateClaimStatus = (id: string, status: string) => { storage.updateClaim({ id, status }); loadData(); };
  const handleAddClaim = (clm: any) => { storage.addClaim(clm); loadData(); };
  const handleAddQAQC = (qa: any) => { storage.addQAQC(qa); loadData(); };
  const handleUpdateQAQC = (qa: any) => { storage.updateQAQC(qa); loadData(); };
  const handleAddSafetyLog = (sf: any) => { storage.addSafetyLog(sf); loadData(); };
  const handleAddUser = (usr: any) => { storage.addUser(usr); loadData(); };
  const handleUpdateProject = (proj: any) => { storage.updateProject(proj); loadData(); };
  const handleDeleteDailyReport = async (id: string) => {
    try { await storage.deleteDailyReport(id); loadData(); }
    finally { refreshSyncSummary(); }
  };

  const retryPendingChanges = async () => {
    if (!storage.isSupabaseConfigured()) return;
    await storage.flushDurableMutations(project.id);
    refreshSyncSummary();
    loadData(authUser.role);
  };

  const handleSwitchProject = async (id: string) => {
    if (!id || id === activeProjectId || projectSwitching) return;
    const switchTo = id;
    // The selector is authoritative. Clear project-bound screen state before
    // any network work so Project A cannot remain visible during the switch.
    setProjectSwitching(true);
    storage.setActiveProjectId(id);
    setActiveProjectId(id);
    setProject(null);
    setActivities([]); setDependencies([]); setDesignPackages([]); setDailyReports([]);
    setBudgetHeads([]); setSubcontractors([]); setIpcSubmissions([]); setIpcPayments([]);
    setQaqc([]); setSafety([]); setClaims([]); setHandover([]); setDefects([]); setExpenses([]);
    window.history.pushState({}, '', workspaceUrl(window.location.href, id, 'dashboard'));
    setActiveTab('dashboard');
    const membership = storage.getMembershipForProject(id);
    try {
      if (membership) {
        const nextUser = { name: membership.name, email: membership.email, role: membership.role, feature_permissions: membership.feature_permissions || null };
        setAuthUser(nextUser);
        localStorage.setItem('bt_auth_user', JSON.stringify(nextUser));
      }
      if (navigator.onLine && storage.isSupabaseConfigured()) {
        await storage.pullActiveProjectFromCloud();
        await storage.flushDurableMutations(id);
      }
      if (isCurrentProject(switchTo, storage.getActiveProjectId())) loadData(membership?.role, switchTo);
    } finally {
      if (isCurrentProject(switchTo, storage.getActiveProjectId())) setProjectSwitching(false);
    }
  };

  const activePermissions = authUser.feature_permissions || storage.getMembershipForProject(project.id)?.feature_permissions || null;
  const canAccess = (feature: Feature, access: 'read' | 'write' = 'read') => can(authUser.role, feature, activePermissions, access);
  const isAllowedTab = (tab: ActiveTab) => tab === 'dashboard' || !TAB_FEATURES[tab] || canAccess(TAB_FEATURES[tab]!);
  const updateTabUrl = (tab: ActiveTab) => {
    window.history.pushState({}, '', workspaceUrl(window.location.href, activeProjectId, tab));
  };
  const setActiveTabFromMenu = (tab: ActiveTab) => {
    setActiveTab(tab);
    updateTabUrl(tab);
    setMobileMenuOpen(false);
  };
  const goToTab = (tab: string) => {
    const next = tab as ActiveTab;
    const allowed = isAllowedTab(next) ? next : 'dashboard';
    setActiveTab(allowed);
    updateTabUrl(allowed);
    setMobileMenuOpen(false);
  };
  const activeFeature = TAB_FEATURES[activeTab];
  const isReadOnlyFeature = Boolean(activeFeature && canAccess(activeFeature, 'read') && !canAccess(activeFeature, 'write'));
  const navHeading = ['field_employee', 'site_engineer', 'subcontractor'].includes(authUser.role)
    ? 'My site work'
    : authUser.role === 'project_manager'
      ? 'Project delivery'
      : authUser.role === 'project_director'
        ? 'Project oversight'
        : 'My workspace';

  const unreadAlertsCount = alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length;
  const unreadNotesCount = notifications.filter(n => !n.read).length;
  const totalNotificationBadge = unreadAlertsCount + unreadNotesCount;

  // Filtered search list for Ctrl+K modal
  const searchableModules = ACTIVE_TABS.filter(tab => isAllowedTab(tab)).map(tab => ({
    tab,
    title: TAB_TITLES[tab]?.title || tab,
    description: TAB_TITLES[tab]?.description || '',
  })).filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.tab.toLowerCase().includes(q);
  });

  return (
    <div className="app-shell min-h-screen flex flex-col md:flex-row font-sans bg-slate-50 text-slate-800">
      {/* Create Project Modal */}
      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={loadData}
        />
      )}

      {/* Quick Search Palette (Ctrl+K / Cmd+K) */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-20 px-4" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50/50">
              <span className="text-slate-400 text-lg">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search modules, activities, settings... (Esc to close)"
                className="flex-1 bg-transparent border-none text-sm text-slate-800 placeholder-slate-400 focus:outline-none min-h-0"
                autoFocus
              />
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">ESC</span>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {searchableModules.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No matching modules found</div>
              ) : (
                searchableModules.map(item => (
                  <button
                    key={item.tab}
                    onClick={() => {
                      goToTab(item.tab);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-blue-50 text-left transition group"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700">{item.title}</div>
                      <div className="text-[11px] text-slate-500">{item.description}</div>
                    </div>
                    <span className="text-xs text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition">Jump →</span>
                  </button>
                ))
              )}
            </div>
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex justify-between items-center">
              <span>Quick navigation across CTMS</span>
              <span className="text-slate-400">Ctrl + K / ⌘K</span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* PERSISTENT LEFT SIDEBAR (Deep Navy inspired by reference designs)   */}
      {/* ------------------------------------------------------------------ */}
      {mobileMenuOpen && (
        <button
          aria-label="Close menu overlay"
          className="app-menu-overlay fixed inset-0 z-30 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-40 w-[84vw] max-w-72 border-r flex flex-col shrink-0 transition-transform duration-200 md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 bg-slate-900 border-slate-800 text-slate-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center font-black text-sm shadow-md shadow-blue-500/30 ring-1 ring-blue-400/40">
              🏗️
            </div>
            <div>
              <div className="font-extrabold text-white text-sm tracking-tight leading-tight">BUILDTRACK <span className="text-blue-400">CTMS</span></div>
              <div className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">Project Control</div>
            </div>
          </div>
          <span className="text-[10px] bg-slate-800 text-blue-400 px-2 py-0.5 rounded-full font-bold border border-slate-700">v2.0</span>
        </div>

        {/* User Profile Chip */}
        <div className="px-3.5 py-3 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-sm ring-2 ring-slate-700">
                {authUser.name.charAt(0).toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" title="Online" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate max-w-[130px]">{authUser.name}</div>
              <div className="text-[10px] text-blue-300 font-semibold truncate capitalize">
                {ROLE_LABELS[normalizeRole(authUser.role)]}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out of CTMS"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
          >
            <span className="text-xs font-bold">⎋</span>
          </button>
        </div>

        {/* Tab Links - 12 Categorized Modules matching prompt requirements */}
        <nav className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)]">
          {/* Group 1: CORE WORKSPACE */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1 tracking-wider">
              1. Core Workspace
            </div>
            <NavBtn tab="dashboard" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📊" label={t('nav.dashboard')} />
            {canAccess('schedule') && <NavBtn tab="cpm" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📅" label="Work Schedule & BOQ" />}
            {canAccess('manage_users') && <NavBtn tab="workforce" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="👥" label="People & Workforce" />}
          </div>

          {/* Group 2: SITE OPERATIONS & FIELD */}
          <div className="space-y-1 pt-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1 tracking-wider">
              2. Field & Resources
            </div>
            {canAccess('daily_reports') && <NavBtn tab="daily" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📝" label={t('nav.daily')} />}
            {canAccess('operations') && <NavBtn tab="operations" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🚜" label="Fleet, Plant & Ops" />}
            {canAccess('procurement') && <NavBtn tab="procurement" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📦" label="Inventory & Stores" />}
            {canAccess('expenses') && <NavBtn tab="expenses" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="💳" label="Purchases & Expenses" accent="emerald" />}
          </div>

          {/* Group 3: COMMERCIAL & CONTROLS */}
          <div className="space-y-1 pt-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1 tracking-wider">
              3. Commercial & Controls
            </div>
            {canAccess('schedule') && <NavBtn tab="measurements" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📐" label="BOQ Measurement" />}
            {canAccess('schedule') && <NavBtn tab="expected_actual" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📈" label="Expected vs Actual" />}
            {canAccess('budget') && <NavBtn tab="budget" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="💰" label="Budget & Costs" />}
            {canAccess('ipc') && <NavBtn tab="ipc" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🧾" label="IPC Billing / Valuations" />}
            {canAccess('claims') && <NavBtn tab="claims" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="⚖️" label="Variations & Claims" />}
            {canAccess('obligations') && <NavBtn tab="obligations" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="⏰" label="Contract Obligations" />}
          </div>

          {/* Group 4: QUALITY, SAFETY & VAULT */}
          <div className="space-y-1 pt-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1 tracking-wider">
              4. Quality & Compliance
            </div>
            {canAccess('qaqc') && <NavBtn tab="qaqc" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🧪" label="QA / QC Inspections" />}
            {canAccess('safety') && <NavBtn tab="safety" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🦺" label="Safety & EHS Logs" />}
            {canAccess('documents') && <NavBtn tab="documents" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📁" label="Document Vault" accent="emerald" />}
            {canAccess('view_evidence') && <NavBtn tab="evidence" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🖼️" label="Director Evidence Vault" />}
          </div>

          {/* Group 5: REPORTS & SETTINGS */}
          <div className="space-y-1 pt-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1 tracking-wider">
              5. Reports & Governance
            </div>
            {canAccess('reports') && <NavBtn tab="reports" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="📤" label="Reports & Analytics" accent="emerald" />}
            {canAccess('handover') && <NavBtn tab="handover" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🔑" label="Handover Checklist" />}
            {canAccess('defects') && <NavBtn tab="defects" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="🔧" label="Defects Maintenance" />}
            {canAccess('subscription') && <NavBtn tab="subscription" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="👑" label="Subscription & Billing" accent="purple" />}
            {canAccess('settings') && <NavBtn tab="settings" activeTab={activeTab} setActiveTab={setActiveTabFromMenu} icon="⚙️" label="System Settings" />}
          </div>
        </nav>

        {/* Sidebar Footer Widget: Field Sync Status (SilverLogix style) */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="rounded-xl bg-slate-900 border border-slate-800/90 p-2.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>{isOnline ? 'Field Cloud Connected' : 'Offline Mode'}</span>
              </div>
              <span className="text-[10px] text-slate-400">{syncSummary.pending} pending</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              {syncSummary.pending > 0
                ? `${syncSummary.pending} local updates pending sync.`
                : 'All project data is backed up and synced.'}
            </p>
            {syncSummary.pending > 0 && (
              <button
                type="button"
                onClick={() => void retryPendingChanges()}
                className="w-full py-1 px-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition"
              >
                Sync Now →
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN CONTENT AREA                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Consistent Top Navigation Bar */}
        <header className="app-header h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md flex items-center justify-between px-4 md:px-6 shrink-0 text-xs gap-3 shadow-xs sticky top-0 z-20">
          {/* Left: Mobile trigger + Project Context Switcher */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100 shadow-xs md:hidden"
              aria-label="Open navigation menu"
            >
              ☰
            </button>

            {authUser.role === 'super_admin' ? (
              <span className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-1.5 text-xs font-bold text-purple-700">
                Platform Subscription Console
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-slate-100/80 border border-slate-200/90 rounded-xl px-2.5 py-1 text-slate-800">
                  <span className="text-slate-500 text-xs">🏢</span>
                  <select
                    value={activeProjectId}
                    onChange={(e) => { void handleSwitchProject(e.target.value); }}
                    disabled={projectSwitching}
                    className="bg-transparent border-none text-xs text-slate-900 font-bold focus:outline-none max-w-[160px] md:max-w-[260px] truncate cursor-pointer p-0 min-h-0"
                  >
                    {projectsList.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {canAccess('manage_projects', 'write') && (
                  <button
                    onClick={() => setShowCreateProject(true)}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition shadow-xs whitespace-nowrap hidden sm:inline-flex items-center gap-1"
                  >
                    <span>+</span> Project
                  </button>
                )}
              </div>
            )}

            {/* Breadcrumb Context */}
            <div className="hidden xl:flex items-center gap-1.5 text-slate-500 text-[11px] font-medium border-l border-slate-200 pl-3">
              <span className="text-slate-400">CTMS</span>
              <span>/</span>
              <span className="text-slate-700 font-bold truncate max-w-[160px]">{project.name}</span>
              <span>/</span>
              <span className="text-blue-600 font-semibold">{TAB_TITLES[activeTab]?.title}</span>
            </div>
          </div>

          {/* Right: Quick Search + Calendar Date + Notifications + Role Badge */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick Search Shortcut */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-500 text-xs transition"
              title="Global search (Ctrl+K)"
            >
              <span>🔍</span>
              <span className="hidden md:inline text-slate-600">Search...</span>
              <span className="text-[10px] font-bold bg-white border border-slate-200 px-1 py-0.2 rounded text-slate-400">⌘K</span>
            </button>

            {/* Date Pill (Nepali BS + AD) */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs hidden lg:flex" title="Nepali Bikram Sambat Date">
              <span>📅</span>
              <span className="font-semibold">{formatBsDate(currentDate, { long: true, language })}</span>
            </div>

            {/* Notifications Bell with Popover */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(prev => !prev)}
                className={`relative p-2 rounded-xl border transition ${
                  showNotifications
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                aria-label="View notifications and alerts"
              >
                <span className="text-sm">🔔</span>
                {totalNotificationBadge > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white ring-2 ring-white">
                    {totalNotificationBadge > 9 ? '9+' : totalNotificationBadge}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Drawer */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in duration-150">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <span>Notifications &amp; Alerts</span>
                      {totalNotificationBadge > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                          {totalNotificationBadge}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        storage.markAllNotificationsRead();
                        setNotifications(storage.getAllNotifications(20));
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {alerts.length > 0 && (
                      <div className="p-2 bg-rose-50/50">
                        <div className="text-[10px] font-bold uppercase text-rose-700 px-2 py-1 tracking-wider">Priority Attention</div>
                        {alerts.slice(0, 3).map((alert, i) => (
                          <div key={i} className="p-2 rounded-xl bg-white border border-rose-200 mb-1.5 shadow-2xs text-xs">
                            <div className="font-bold text-rose-900 flex items-center justify-between">
                              <span>{alert.type}</span>
                              <span className="text-[10px] text-rose-600 font-semibold uppercase">{alert.severity}</span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">{alert.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="p-2 space-y-1">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">No new notifications</div>
                      ) : (
                        notifications.slice(0, 6).map(n => (
                          <div key={n.id} className={`p-2.5 rounded-xl text-xs transition ${n.read ? 'bg-white' : 'bg-blue-50/60 font-medium'}`}>
                            <div className="font-bold text-slate-900">{n.action}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                              <span>{n.module} · {n.actor || 'Staff'}</span>
                              <span>{formatBsDate(n.created_at?.slice(0, 10) || currentDate)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Language Switcher */}
            <select
              id="language"
              value={language}
              onChange={event => setLanguage(event.target.value as typeof language)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none min-h-0 cursor-pointer"
            >
              <option value="ne">नेपाली</option>
              <option value="en">English</option>
            </select>

            {/* Role indicator pill */}
            <div className="hidden sm:flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-2.5 py-1 text-blue-700">
              <span className="text-[11px] font-bold capitalize">
                {ROLE_LABELS[normalizeRole(authUser.role)]}
              </span>
            </div>
          </div>
        </header>

        {/* System & Connection Banners */}
        {!isOnline && (
          <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950 flex items-center justify-between">
            <span>⚠️ {t('common.noConnection')} Changes are preserved securely on this device and will sync automatically when back online.</span>
          </div>
        )}
        {isOnline && syncSummary.conflicts > 0 && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-950">
            <span>{syncSummary.conflicts} saved-on-device change{syncSummary.conflicts === 1 ? '' : 's'} need review before synchronization. {syncSummary.lastError || ''}</span>
            <button type="button" onClick={() => void retryPendingChanges()} className="rounded-lg bg-rose-700 px-3 py-1 font-bold text-white hover:bg-rose-800 transition">
              Retry connection
            </button>
          </div>
        )}
        {isOnline && syncSummary.conflicts === 0 && syncSummary.pending > 0 && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950">
            <span>{syncSummary.pending} local change{syncSummary.pending === 1 ? '' : 's'} saved on this device and awaiting cloud confirmation.</span>
            <button type="button" onClick={() => void retryPendingChanges()} className="rounded-lg bg-amber-700 px-3 py-1 font-bold text-white hover:bg-amber-800 transition">
              Sync now
            </button>
          </div>
        )}

        {/* ---- Active Dashboard Panel ---- */}
        <main id="main-content" className="app-main flex-1 p-4 md:p-6 overflow-y-auto max-h-[calc(100vh-56px)]" tabIndex={-1}>
          {activeTab !== 'dashboard' && <div className="mb-5 flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t('shell.projectContext')} · {project.name}</p><h1 className="text-2xl font-extrabold text-slate-900">{TAB_TITLES[activeTab].title}</h1><p className="text-sm text-slate-600">{TAB_TITLES[activeTab].description}</p></div><button onClick={() => goToTab('dashboard')} className="min-h-10 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('common.back')}</button></div>}
          {isReadOnlyFeature && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">Your Project Director granted view-only access to this module. Editing and uploads are disabled.</div>}
          {!isAllowedTab(activeTab) ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><h1 className="font-bold">{t('common.accessDenied')}</h1><p className="mt-1 text-sm">Ask your Project Director to review your access, or return to your dashboard.</p><button onClick={() => goToTab('dashboard')} className="mt-3 min-h-10 rounded-lg bg-amber-700 px-3 py-2 text-sm font-bold text-white">{t('common.back')}</button></div> : <div className={isReadOnlyFeature ? 'feature-read-only' : ''} aria-readonly={isReadOnlyFeature}>
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

          {activeTab === 'measurements' && <BoqMeasurementDashboard projectId={project.id} canReview={authUser.role === 'project_director'} />}

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

          {activeTab === 'claims' && <CommercialControlWorkspace key={`commercial-${project.id}`} projectId={project.id} role={authUser.role} />}

          {activeTab === 'procurement' && (
            <ProcurementStoresDashboard key={project.id} projectId={project.id} canEdit={canAccess('procurement', 'write')} />
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

          {activeTab === 'workforce' && <EmployeeWorkforceDashboard organizationId={project.organization_id} projectId={project.id} canManage={authUser.role === 'business_admin'} />}

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
          </div>}
        </main>
      </div>
    </div>
  );
}
