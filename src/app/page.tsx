'use client';

import React, { useState, useEffect } from 'react';
import { storage } from '../lib/storage';
import { calculateEVM, EVMMetrics } from '../lib/evm';
import { Activity, Dependency, diffDays } from '../lib/cpm';

// Dashboard views imports
import CpmTimelineDashboard from '../components/CpmTimelineDashboard';
import ExpectedActualDashboard from '../components/ExpectedActualDashboard';
import ProjectionDashboard from '../components/ProjectionDashboard';
import DesignDashboard from '../components/DesignDashboard';
import BudgetDashboard from '../components/BudgetDashboard';
import IpcDashboard from '../components/IpcDashboard';
import ClaimsDashboard from '../components/ClaimsDashboard';
import QaqcDashboard from '../components/QaqcDashboard';
import SafetyDashboard from '../components/SafetyDashboard';
import HandoverDashboard from '../components/HandoverDashboard';
import DefectsDashboard from '../components/DefectsDashboard';
import SettingsPanel from '../components/SettingsPanel';
import AiAssistant from '../components/AiAssistant';
import AuthLayout from '../components/AuthLayout';
import FinanceTracker from '../components/FinanceTracker';
import DocumentTracker from '../components/DocumentTracker';
import ProcurementStoresDashboard from '../components/ProcurementStoresDashboard';
import ContractObligationsDashboard from '../components/ContractObligationsDashboard';
import DailyReportingDashboard from '../components/DailyReportingDashboard';
import ReportCenter from '../components/ReportCenter';
import DailyExpenseDashboard from '../components/DailyExpenseDashboard';
import RoleDashboard from '../components/RoleDashboard';
import OperationalControlDashboard from '../components/OperationalControlDashboard';
import EvidenceVault from '../components/EvidenceVault';
import { can, ROLE_LABELS, normalizeRole } from '../lib/permissions';
import type { Feature } from '../lib/permissions';

type ActiveTab =
  | 'dashboard' | 'cpm' | 'expected_actual' | 'projection'
  | 'design' | 'budget' | 'ipc' | 'claims'
  | 'qaqc' | 'safety'
  | 'handover' | 'defects'
  | 'finance' | 'documents'
  | 'procurement' | 'obligations' | 'daily' | 'reports' | 'expenses'
  | 'operations' | 'evidence'
  | 'ai' | 'settings';

const TAB_FEATURES: Partial<Record<ActiveTab, Feature>> = {
  cpm: 'schedule', expected_actual: 'schedule', projection: 'forecast', daily: 'daily_reports',
  operations: 'operations', evidence: 'view_evidence', design: 'design', budget: 'budget',
  ipc: 'ipc', claims: 'claims', procurement: 'procurement', obligations: 'obligations',
  qaqc: 'qaqc', safety: 'safety', finance: 'finance', expenses: 'expenses',
  documents: 'documents', reports: 'reports', handover: 'handover', defects: 'defects',
  ai: 'ai', settings: 'settings',
};

interface AuthUser {
  name: string;
  email: string;
  role: string;
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
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().split('T')[0]
  );
  const [duration, setDuration] = useState(730);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    storage.createProject(name, amount, startDate, duration);
    onCreated();
    onClose();
    alert(`Project "${name}" created and set as active project.`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
        <div className="flex justify-between items-center">
          <h2 className="text-slate-100 font-bold text-sm">🏗️ Create New Project</h2>
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
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
              />
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
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow transition"
            >
              Create Project
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
          </div>
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
  const [risks, setRisks] = useState<any[]>([]);
  const [handover, setHandover] = useState<any[]>([]);
  const [defects, setDefects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [resourceUsage, setResourceUsage] = useState<any[]>([]);
  const [employeeVisits, setEmployeeVisits] = useState<any[]>([]);

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
    setRisks(storage.getRisks());
    setHandover(storage.getHandoverChecklist());
    setDefects(storage.getDefects());
    setUsers(storage.getUsers());
    setExpenses(storage.getDailyExpenses());
    setResourceUsage(storage.getDailyResourceUsage());
    setEmployeeVisits(storage.getEmployeeVisits());
  };

  // Check persisted auth on mount
  useEffect(() => {
    let unsubscribe = () => {};
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bt_auth_user');
      if (saved) {
        try {
          setAuthUser(JSON.parse(saved));
        } catch { /* noop */ }
      }
      setAuthChecked(true);
      loadData();
      if (storage.isSupabaseConfigured()) {
        void storage.getCurrentAuthUser().then(user => {
          if (user) {
            setAuthUser(user);
            localStorage.setItem('bt_auth_user', JSON.stringify(user));
          }
        });
        unsubscribe = storage.onAuthStateChange(user => {
          setAuthUser(user);
          if (user) localStorage.setItem('bt_auth_user', JSON.stringify(user));
          else localStorage.removeItem('bt_auth_user');
        });
      }
    }
    return () => unsubscribe();
  }, []);

  // ---- Auth Handlers ----
  const handleAuthSuccess = (user: AuthUser) => {
    setAuthUser(user);
    setActiveTab('dashboard');
    if (typeof window !== 'undefined') {
      localStorage.setItem('bt_auth_user', JSON.stringify(user));
    }
    storage.addUser(user);
    void storage.ensureActiveProjectMembership(user);
    loadData();
  };

  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bt_auth_user');
    }
    void storage.signOut();
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
  const handleAddDependency = (dep: any) => { storage.addDependency(dep); loadData(); };
  const handleDeleteDependency = (id: string) => { storage.deleteDependency(id); loadData(); };
  const handleUpdatePackage = (pkg: any) => { storage.updateDesignPackage(pkg); loadData(); };
  const handleAddComment = (cmt: any) => { storage.addDesignComment(cmt); loadData(); };
  const handleSubmitDailyReport = (rep: any, work: any[], mats: any[]) => { storage.submitDailyReport(rep, work, mats); loadData(); };
  const handleUpdateBudget = (bdg: any) => { storage.updateBudgetHead(bdg); loadData(); };
  const handleUpdateClaimStatus = (id: string, status: string) => { storage.updateClaim({ id, status }); loadData(); };
  const handleSubmitIPC = (ipc: any) => { storage.submitIPC(ipc); loadData(); };
  const handleCertifyIPC = (id: string, certAmount: number, retention: number, advance: number) => { storage.certifyIPC(id, certAmount, retention, advance); loadData(); };
  const handlePayIPC = (id: string, paidAmount: number) => { storage.payIPC(id, paidAmount); loadData(); };
  const handleAddClaim = (clm: any) => { storage.addClaim(clm); loadData(); };
  const handleAddQAQC = (qa: any) => { storage.addQAQC(qa); loadData(); };
  const handleUpdateQAQC = (qa: any) => { storage.updateQAQC(qa); loadData(); };
  const handleAddSafetyLog = (sf: any) => { storage.addSafetyLog(sf); loadData(); };
  const handleToggleHandoverItem = (id: string, name: string) => { storage.toggleHandoverItem(id, name); loadData(); };
  const handleUpdateDefectStatus = (id: string, status: any) => { storage.updateDefectStatus(id, status); loadData(); };
  const handleAddDefect = (def: any) => { storage.addDefect(def); loadData(); };
  const handleAddUser = (usr: any) => { storage.addUser(usr); loadData(); };
  const handleUpdateProject = (proj: any) => { storage.updateProject(proj); loadData(); };

  const handleSwitchProject = (id: string) => {
    storage.setActiveProjectId(id);
    setActiveTab('dashboard');
    loadData();
  };

  // ---- DB status badge ----
  const isSupabaseConnected = storage.isSupabaseConfigured();
  const isAllowedTab = (tab: ActiveTab) => tab === 'dashboard' || !TAB_FEATURES[tab] || can(authUser.role, TAB_FEATURES[tab]!);
  const goToTab = (tab: string) => {
    const next = tab as ActiveTab;
    setActiveTab(isAllowedTab(next) ? next : 'dashboard');
  };

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
      <aside className="app-sidebar w-full md:w-72 border-b md:border-b-0 md:border-r flex flex-col shrink-0">
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
          <NavBtn tab="dashboard" activeTab={activeTab} setActiveTab={setActiveTab} icon="📊" label="My Dashboard" />
          {can(authUser.role, 'schedule') && <NavBtn tab="cpm" activeTab={activeTab} setActiveTab={setActiveTab} icon="📅" label="WBS / CPM Scheduler" />}
          {can(authUser.role, 'schedule') && <NavBtn tab="expected_actual" activeTab={activeTab} setActiveTab={setActiveTab} icon="📈" label="Expected vs Actual" />}
          {can(authUser.role, 'forecast') && <NavBtn tab="projection" activeTab={activeTab} setActiveTab={setActiveTab} icon="🔮" label="Forecast & Projections" />}
          {can(authUser.role, 'daily_reports') && <NavBtn tab="daily" activeTab={activeTab} setActiveTab={setActiveTab} icon="📝" label="Daily Site Reporting" />}
          {can(authUser.role, 'operations') && <NavBtn tab="operations" activeTab={activeTab} setActiveTab={setActiveTab} icon="🚜" label="Resources & Productivity" />}
          {can(authUser.role, 'view_evidence') && <NavBtn tab="evidence" activeTab={activeTab} setActiveTab={setActiveTab} icon="🖼️" label="Director Evidence Vault" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Engineering & Controls</div>
          {can(authUser.role, 'design') && <NavBtn tab="design" activeTab={activeTab} setActiveTab={setActiveTab} icon="📐" label="Design Approval Register" />}
          {can(authUser.role, 'budget') && <NavBtn tab="budget" activeTab={activeTab} setActiveTab={setActiveTab} icon="💰" label="Budget & Costs" />}
          {can(authUser.role, 'ipc') && <NavBtn tab="ipc" activeTab={activeTab} setActiveTab={setActiveTab} icon="🧾" label="IPC Billing / Valuation" />}
          {can(authUser.role, 'claims') && <NavBtn tab="claims" activeTab={activeTab} setActiveTab={setActiveTab} icon="⚖️" label="Variations & Claims" />}
          {can(authUser.role, 'procurement') && <NavBtn tab="procurement" activeTab={activeTab} setActiveTab={setActiveTab} icon="🚚" label="Procurement & Stores" />}
          {can(authUser.role, 'obligations') && <NavBtn tab="obligations" activeTab={activeTab} setActiveTab={setActiveTab} icon="⏰" label="Contract Obligations" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Site Quality & Safety</div>
          {can(authUser.role, 'qaqc') && <NavBtn tab="qaqc" activeTab={activeTab} setActiveTab={setActiveTab} icon="🧪" label="QA / QC Inspections" />}
          {can(authUser.role, 'safety') && <NavBtn tab="safety" activeTab={activeTab} setActiveTab={setActiveTab} icon="🦺" label="Safety / EHS Logs" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Finance & Documents</div>
          {can(authUser.role, 'finance') && <NavBtn tab="finance" activeTab={activeTab} setActiveTab={setActiveTab} icon="📉" label="Finance Tracker" accent="emerald" />}
          {can(authUser.role, 'expenses') && <NavBtn tab="expenses" activeTab={activeTab} setActiveTab={setActiveTab} icon="🧾" label="Daily Expense Register" accent="emerald" />}
          {can(authUser.role, 'documents') && <NavBtn tab="documents" activeTab={activeTab} setActiveTab={setActiveTab} icon="📁" label="Document Registry" accent="emerald" />}
          {can(authUser.role, 'reports') && <NavBtn tab="reports" activeTab={activeTab} setActiveTab={setActiveTab} icon="📤" label="Reports & Exports" accent="emerald" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">Completion Dossier</div>
          {can(authUser.role, 'handover') && <NavBtn tab="handover" activeTab={activeTab} setActiveTab={setActiveTab} icon="🔑" label="Handover Checklist" />}
          {can(authUser.role, 'defects') && <NavBtn tab="defects" activeTab={activeTab} setActiveTab={setActiveTab} icon="🔧" label="Defects Maintenance" />}

          <div className="text-[9px] font-bold text-slate-500 uppercase px-2 pt-3 mb-1.5 tracking-wider">AI Operations & Setup</div>
          {can(authUser.role, 'ai') && <NavBtn tab="ai" activeTab={activeTab} setActiveTab={setActiveTab} icon="✨" label="AI Assistant Panel" accent="purple" />}
          {can(authUser.role, 'settings') && <NavBtn tab="settings" activeTab={activeTab} setActiveTab={setActiveTab} icon="⚙️" label="System Settings" />}
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
            <select
              value={project.id}
              onChange={(e) => handleSwitchProject(e.target.value)}
              className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 font-semibold focus:outline-none max-w-[180px] md:max-w-[300px] truncate"
            >
              {projectsList.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {can(authUser.role, 'manage_projects') && <button
              onClick={() => setShowCreateProject(true)}
              className="px-2 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-[10px] font-bold rounded transition whitespace-nowrap"
            >
              + New Project
            </button>}
          </div>

          {/* Right: DB status + date + role switcher */}
          <div className="flex items-center gap-3 shrink-0">
            {/* DB Status badge */}
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border ${
              isSupabaseConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {isSupabaseConnected ? 'Supabase Live' : 'Local Sandbox'}
            </div>

            <div className="flex items-center gap-1 text-slate-500 hidden lg:flex">
              <span>📅</span>
              <span className="font-mono">{currentDate}</span>
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
          {activeTab === 'dashboard' && (
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
            />
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

          {activeTab === 'projection' && (
            <ProjectionDashboard
              project={project}
              activities={activities}
              evm={evmMetrics}
              designPackages={designPackages}
              risks={risks}
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
              userRole={authUser.role}
              onSubmit={handleSubmitDailyReport}
              onReload={loadData}
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
            <IpcDashboard
              ipcSubmissions={ipcSubmissions}
              onSubmitIPC={handleSubmitIPC}
              onCertifyIPC={handleCertifyIPC}
              onPayIPC={handlePayIPC}
              userRole={authUser.role}
            />
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
            <ContractObligationsDashboard key={project.id} projectId={project.id} />
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

          {/* ---- NEW: Finance Tracker ---- */}
          {activeTab === 'finance' && (
            <div className="space-y-2">
              <FinanceTracker key={project.id} projectId={project.id} />
            </div>
          )}

          {activeTab === 'expenses' && (
            <DailyExpenseDashboard key={project.id} projectId={project.id} userName={authUser.name} userRole={authUser.role} />
          )}

          {/* ---- NEW: Document Registry ---- */}
          {activeTab === 'documents' && (
            <DocumentTracker key={project.id} userRole={authUser.role} projectId={project.id} />
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
              onToggleItem={handleToggleHandoverItem}
              userRole={authUser.role}
            />
          )}

          {activeTab === 'defects' && (
            <DefectsDashboard
              defectsList={defects}
              onAddDefect={handleAddDefect}
              onUpdateStatus={handleUpdateDefectStatus}
              userRole={authUser.role}
            />
          )}

          {/* ---- AI Assistant with WBS scanner + reload callback ---- */}
          {activeTab === 'ai' && (
            <AiAssistant
              activities={activities}
              onSubmitDailyReport={handleSubmitDailyReport}
              currentDate={currentDate}
              onReloadData={loadData}
              projectStartDate={project.start_date}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              users={users}
              onAddUser={handleAddUser}
              onResetDb={storage.resetDatabase}
              project={project}
              onUpdateProject={handleUpdateProject}
              userRole={authUser.role}
            />
          )}
        </main>
      </div>
    </div>
  );
}
