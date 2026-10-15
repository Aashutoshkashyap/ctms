import React, { useMemo, useState } from 'react';
import { Activity } from '../lib/cpm';
import { DailyExpense, DailyResourceUsage, EmployeeVisit } from '../lib/storage';
import { can, normalizeRole, ROLE_HOME_COPY, ROLE_LABELS } from '../lib/permissions';
import type { FeaturePermissions } from '../lib/permissions';
import { useLanguage } from './LanguageProvider';
import type { TranslationKey } from '../lib/i18n';
import { todayAdDate, formatBsDate } from '../lib/nepaliDate';

interface Props {
  role: string;
  userName: string;
  project: any;
  activities: Activity[];
  expenses: DailyExpense[];
  resourceUsage: DailyResourceUsage[];
  visits: EmployeeVisit[];
  alerts: Array<{ type: string; message: string; severity: string }>;
  onNavigate: (tab: string) => void;
  featurePermissions?: FeaturePermissions | null;
}

type NextAction = { label: TranslationKey; tab: string; icon: string; feature: Parameters<typeof can>[1]; desc: string };

function actionsForRole(role: string): NextAction[] {
  switch (normalizeRole(role)) {
    case 'business_admin': return [
      { icon: '👥', label: 'action.people', tab: 'settings', feature: 'manage_users', desc: 'Provision team members and project assignments.' },
      { icon: '🏗️', label: 'action.projects', tab: 'settings', feature: 'manage_projects', desc: 'Configure project parameters and storage bindings.' },
    ];
    case 'planning_engineer': return [
      { icon: '📅', label: 'action.schedule', tab: 'cpm', feature: 'schedule', desc: 'Review critical path, lag times, and baseline schedule.' },
      { icon: '📈', label: 'action.progress', tab: 'expected_actual', feature: 'schedule', desc: 'Compare S-curve targets against actual site progress.' },
      { icon: '📤', label: 'director.reports', tab: 'reports', feature: 'reports', desc: 'Export executive progress and schedule summaries.' },
    ];
    case 'design_coordinator': return [
      { icon: '📐', label: 'action.design', tab: 'design', feature: 'design', desc: 'Manage drawings, submittals, and client approvals.' },
      { icon: '📁', label: 'action.report', tab: 'documents', feature: 'documents', desc: 'Review specifications and technical documentation.' },
    ];
    case 'field_employee': return [
      { icon: '📝', label: 'daily.today', tab: 'daily', feature: 'daily_reports', desc: 'Submit daily work quantities, obstacles, and photos.' },
      { icon: '🚜', label: 'action.progress', tab: 'operations', feature: 'operations', desc: 'Record plant hours, equipment use, and fuel refills.' },
      { icon: '🧾', label: 'action.expenses', tab: 'expenses', feature: 'expenses', desc: 'Log site petty cash expenditures with receipts.' },
    ];
    case 'site_engineer': return [
      { icon: '📝', label: 'daily.today', tab: 'daily', feature: 'daily_reports', desc: 'Verify work quantities, daily constraints, and photos.' },
      { icon: '🚜', label: 'action.progress', tab: 'operations', feature: 'operations', desc: 'Check plant utilization and daily excavator productivity.' },
      { icon: '🧪', label: 'action.quality', tab: 'qaqc', feature: 'qaqc', desc: 'Log QA/QC inspection requests and site testing results.' },
    ];
    case 'project_manager': return [
      { icon: '📅', label: 'action.plan', tab: 'cpm', feature: 'schedule', desc: 'Monitor schedule delays and critical path milestones.' },
      { icon: '📝', label: 'action.progress', tab: 'daily', feature: 'daily_reports', desc: 'Review site supervisor submissions and daily photos.' },
      { icon: '⚖️', label: 'action.commercial', tab: 'claims', feature: 'claims', desc: 'Review client variations, delay claims, and EOT requests.' },
    ];
    case 'accountant':
    case 'qs_billing_engineer': return [
      { icon: '🧾', label: 'action.expenses', tab: 'expenses', feature: 'expenses', desc: 'Audit daily expense vouchers and approve valid receipts.' },
      { icon: '📄', label: 'action.ipc', tab: 'ipc', feature: 'ipc', desc: 'Compile interim payment certificates and valuations.' },
      { icon: '💰', label: 'action.commercial', tab: 'budget', feature: 'budget', desc: 'Track cost heads against internal budget thresholds.' },
    ];
    case 'store_officer': return [
      { icon: '🚚', label: 'action.stock', tab: 'procurement', feature: 'procurement', desc: 'Record inbound material receipts and issues to site.' },
      { icon: '🚜', label: 'action.progress', tab: 'operations', feature: 'operations', desc: 'Monitor plant fuel issues and site consumption.' },
    ];
    case 'qa_qc_engineer': return [
      { icon: '🧪', label: 'action.quality', tab: 'qaqc', feature: 'qaqc', desc: 'Inspect work, issue NCRs, and record lab test reports.' },
      { icon: '📝', label: 'action.progress', tab: 'daily', feature: 'daily_reports', desc: 'Check daily work quality notes and site compliance.' },
    ];
    case 'safety_officer': return [
      { icon: '🦺', label: 'action.safety', tab: 'safety', feature: 'safety', desc: 'Conduct site safety walks, log incidents, and permits.' },
      { icon: '🚜', label: 'action.progress', tab: 'operations', feature: 'operations', desc: 'Inspect PPE compliance and machinery safety.' },
    ];
    default: return [
      { icon: '📅', label: 'action.schedule', tab: 'cpm', feature: 'schedule', desc: 'View project work programme and milestones.' },
      { icon: '📝', label: 'action.report', tab: 'daily', feature: 'daily_reports', desc: 'Review daily construction records and progress logs.' },
      { icon: '📤', label: 'director.reports', tab: 'reports', feature: 'reports', desc: 'Generate project reports and downloadable summaries.' },
    ];
  }
}

const moduleCards = [
  { feature: 'schedule', tab: 'cpm', icon: '📅', title: 'Work Schedule & BOQ', copy: 'Program, milestones, dependencies, and delay remarks.' },
  { feature: 'daily_reports', tab: 'daily', icon: '📝', title: 'Daily Site Reporting', copy: 'Completed work, field issues, and evidence photos.' },
  { feature: 'operations', tab: 'operations', icon: '🚜', title: 'Fleet & Plant Operations', copy: 'Machinery efficiency, fuel, and manpower deployment.' },
  { feature: 'expenses', tab: 'expenses', icon: '💳', title: 'Site Purchases & Expenses', copy: 'Date-based expenditure, vouchers, and approvals.' },
  { feature: 'procurement', tab: 'procurement', icon: '📦', title: 'Inventory & Stores', copy: 'Purchase orders, delivery intake, and stock ledgers.' },
  { feature: 'budget', tab: 'budget', icon: '💰', title: 'Commercial & Budget', copy: 'Internal budgets, EVM tracking, and cost control.' },
  { feature: 'ipc', tab: 'ipc', icon: '🧾', title: 'IPC Billing / Valuations', copy: 'Measurement books, billing certificates, and cash flow.' },
  { feature: 'qaqc', tab: 'qaqc', icon: '🧪', title: 'Quality Control & NCRs', copy: 'Test records, inspections, and defect rectifications.' },
  { feature: 'safety', tab: 'safety', icon: '🦺', title: 'Safety & EHS Controls', copy: 'Permits to work, safety audits, and incident reports.' },
  { feature: 'documents', tab: 'documents', icon: '📁', title: 'Document Vault', copy: 'Contract agreements, drawings, and correspondence.' },
  { feature: 'view_evidence', tab: 'evidence', icon: '🖼️', title: 'Director Evidence Vault', copy: 'Cryptographically-backed photographic evidence.' },
  { feature: 'settings', tab: 'settings', icon: '⚙️', title: 'System Administration', copy: 'Users, roles, project setup, and cloud synchronisation.' },
] as const;

export default function RoleDashboard({
  role,
  userName,
  project,
  activities,
  expenses,
  resourceUsage,
  visits,
  alerts,
  onNavigate,
  featurePermissions,
}: Props) {
  const { t } = useLanguage();
  const normalizedRole = normalizeRole(role);
  const copy = ROLE_HOME_COPY[normalizedRole];

  // Table filter and search states
  const [tableFilter, setTableFilter] = useState<'all' | 'in_progress' | 'delayed' | 'completed'>('all');
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const metrics = useMemo(() => {
    const approvedExpenses = expenses.filter(item => item.status === 'approved');
    const today = todayAdDate();
    const activeActivities = activities.filter(item => item.status === 'in_progress').length;
    const completedActivities = activities.filter(item => item.status === 'completed').length;
    const delayedActivities = activities.filter(item => {
      const forecastDelay = (item.early_finish || item.baseline_finish) > item.baseline_finish;
      const overdue = item.status !== 'completed' && today > item.baseline_finish;
      return forecastDelay || overdue;
    }).length;
    const fuel = resourceUsage.reduce((sum, item) => sum + item.fuel_litres, 0);
    const work = resourceUsage.reduce((sum, item) => sum + item.work_quantity, 0);

    return {
      activeActivities,
      completedActivities,
      delayedActivities,
      accumulatedCost: approvedExpenses.reduce((sum, item) => sum + item.amount, 0),
      pendingCost: expenses.filter(item => item.status === 'submitted').reduce((sum, item) => sum + item.amount, 0),
      fuelEfficiency: fuel > 0 ? work / fuel : 0,
      todayVisits: visits.filter(item => item.visit_date === today && item.status !== 'cancelled').length,
    };
  }, [activities, expenses, resourceUsage, visits]);

  const visibleCards = moduleCards.filter(card => can(role, card.feature, featurePermissions));
  const nextActions = actionsForRole(role).filter(action => can(role, action.feature, featurePermissions));

  // Filtered activities list for recent deliveries / work table
  const today = todayAdDate();
  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      const isDelayed = (act.early_finish || act.baseline_finish) > act.baseline_finish || (act.status !== 'completed' && today > act.baseline_finish);
      if (tableFilter === 'in_progress' && act.status !== 'in_progress') return false;
      if (tableFilter === 'completed' && act.status !== 'completed') return false;
      if (tableFilter === 'delayed' && !isDelayed) return false;

      if (!tableSearch.trim()) return true;
      const q = tableSearch.toLowerCase();
      return (
        act.id.toLowerCase().includes(q) ||
        act.name.toLowerCase().includes(q) ||
        (act.wbs_code && act.wbs_code.toLowerCase().includes(q))
      );
    });
  }, [activities, tableFilter, tableSearch, today]);

  const paginatedActivities = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredActivities.slice(start, start + pageSize);
  }, [filteredActivities, page]);

  const totalPages = Math.ceil(filteredActivities.length / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Header Banner with Project Context & Identity                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 md:p-6 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-50 to-indigo-50/20 -z-0 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                {ROLE_LABELS[normalizedRole]}
              </span>
              <span className="text-xs text-slate-500 font-medium">· Active Project Workspace</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{copy.title}</h1>
            <p className="mt-1 max-w-2xl text-xs md:text-sm text-slate-600 leading-relaxed">{copy.subtitle}</p>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-xs">{userName}</div>
              <div className="text-[11px] text-slate-500 truncate max-w-[170px]" title={project.name}>
                {project.name}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. 4 Colorful Summary Stat Cards (SilverLogix Inspiration)         */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Work Items (Blue) */}
        <button
          onClick={() => onNavigate('cpm')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:shadow-md hover:border-blue-300 transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
              📅
            </div>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
              Active Programme
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Work Items</div>
            <div className="text-3xl font-black text-slate-900 mt-1">{metrics.activeActivities}</div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <span>↑</span> {metrics.completedActivities} completed
            </span>
            <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">Open schedule →</span>
          </div>
        </button>

        {/* Card 2: Delayed / Overdue Tasks (Rose) */}
        <button
          onClick={() => onNavigate('cpm')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:shadow-md hover:border-rose-300 transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
              ⚠️
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${metrics.delayedActivities > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {metrics.delayedActivities > 0 ? 'Attention Required' : 'On Track'}
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delayed Activities</div>
            <div className={`text-3xl font-black mt-1 ${metrics.delayedActivities > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {metrics.delayedActivities}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className={metrics.delayedActivities > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
              {metrics.delayedActivities > 0 ? 'Behind baseline finish' : 'No critical delays'}
            </span>
            <span className="text-rose-700 font-bold group-hover:translate-x-1 transition-transform">Inspect →</span>
          </div>
        </button>

        {/* Card 3: Pending Approvals & Costs (Amber) */}
        <button
          onClick={() => onNavigate('expenses')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:shadow-md hover:border-amber-300 transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
              💳
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${metrics.pendingCost > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              {metrics.pendingCost > 0 ? 'Needs Review' : 'Up to Date'}
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Spend Approvals</div>
            <div className="text-3xl font-black text-slate-900 mt-1">
              NPR {(metrics.pendingCost / 1_000_000).toFixed(2)}m
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="text-amber-800 font-semibold">Submitted vouchers</span>
            <span className="text-amber-700 font-bold group-hover:translate-x-1 transition-transform">Review queue →</span>
          </div>
        </button>

        {/* Card 4: Accumulated Spend / Incurred Cost (Emerald/Purple) */}
        <button
          onClick={() => onNavigate(can(role, 'budget', featurePermissions) ? 'budget' : 'expenses')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:shadow-md hover:border-emerald-300 transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
              💰
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Approved
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Accumulated Cost</div>
            <div className="text-3xl font-black text-slate-900 mt-1">
              NPR {(metrics.accumulatedCost / 1_000_000).toFixed(2)}m
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="text-emerald-700 font-semibold">Total verified site spend</span>
            <span className="text-emerald-700 font-bold group-hover:translate-x-1 transition-transform">View audit →</span>
          </div>
        </button>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Priority Attention Section                                      */}
      {/* ------------------------------------------------------------------ */}
      {alerts.length > 0 && can(role, 'executive', featurePermissions) && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-rose-600 text-base">🚨</span>
              <h2 className="text-sm font-bold text-rose-950 uppercase tracking-wider">Priority Attention &amp; Critical Alerts</h2>
            </div>
            <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
              {alerts.length} action items
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {alerts.slice(0, 4).map((alert, idx) => (
              <div
                key={`${alert.type}-${idx}`}
                className="rounded-xl bg-white border border-rose-200 p-3.5 shadow-2xs flex items-start justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-rose-700 uppercase tracking-wide">{alert.type}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded uppercase bg-rose-50 text-rose-600 border border-rose-100">
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700 leading-snug">{alert.message}</p>
                </div>
                <button
                  onClick={() => onNavigate(alert.type === 'Schedule' ? 'cpm' : alert.type === 'Cash Flow' ? 'ipc' : alert.type === 'Cost' ? 'budget' : alert.type === 'Quality' ? 'qaqc' : 'safety')}
                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold shrink-0 transition"
                >
                  Resolve →
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. Recent Deliveries & Site Activities Data Table (Visual Ref)     */}
      {/* ------------------------------------------------------------------ */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        {/* Table Top Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-600 text-base">📋</span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Site Deliveries &amp; Activities</h2>
              <p className="text-xs text-slate-500">Live BOQ tasks, baseline delivery dates, and current completion</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
              <input
                type="text"
                value={tableSearch}
                onChange={e => {
                  setTableSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search activity..."
                className="pl-7 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 min-h-0 w-36 sm:w-44"
              />
            </div>

            {/* Filter Pills */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
              {(['all', 'in_progress', 'delayed', 'completed'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setTableFilter(tab);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs capitalize transition ${
                    tableFilter === tab
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab === 'in_progress' ? 'In Progress' : tab}
                </button>
              ))}
            </div>

            <button
              onClick={() => onNavigate('cpm')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
            >
              Full Schedule →
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Task Ref</th>
                <th className="py-3 px-4">Activity Name</th>
                <th className="py-3 px-4">WBS Code</th>
                <th className="py-3 px-4">Baseline Finish</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedActivities.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No activities match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedActivities.map(act => {
                  const isDelayed = (act.early_finish || act.baseline_finish) > act.baseline_finish || (act.status !== 'completed' && today > act.baseline_finish);
                  return (
                    <tr key={act.id} className="hover:bg-blue-50/30 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">
                        {act.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{act.name}</div>
                        <div className="text-[11px] text-slate-500">
                          Qty: {act.actual_quantity || 0} / {act.planned_quantity || 0} {act.unit || 'units'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {act.wbs_code || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {formatBsDate(act.baseline_finish)}
                      </td>
                      <td className="py-3 px-4">
                        {act.status === 'completed' ? (
                          <span className="status-pill status-pill-completed">
                            <span className="status-pill-dot" />
                            Completed
                          </span>
                        ) : isDelayed ? (
                          <span className="status-pill status-pill-delayed">
                            <span className="status-pill-dot" />
                            Delayed
                          </span>
                        ) : act.status === 'in_progress' ? (
                          <span className="status-pill status-pill-progress">
                            <span className="status-pill-dot" />
                            In Progress
                          </span>
                        ) : (
                          <span className="status-pill status-pill-pending">
                            <span className="status-pill-dot" />
                            Scheduled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onNavigate('cpm')}
                          className="px-2.5 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100 font-bold rounded-lg transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-500">
          <div>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredActivities.length)} of {filteredActivities.length} entries
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold hover:bg-slate-50"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded-lg font-bold text-xs transition ${
                  page === p
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold hover:bg-slate-50"
            >
              ›
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Next Recommended Role Actions                                    */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="next-actions-heading" className="space-y-3">
        <div>
          <h2 id="next-actions-heading" className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            {t('home.next')}
          </h2>
          <p className="text-xs text-slate-500">Quick direct shortcuts optimized for {ROLE_LABELS[normalizedRole]}.</p>
        </div>
        {nextActions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nextActions.map(action => (
              <button
                key={action.tab}
                onClick={() => onNavigate(action.tab)}
                className="group flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 text-xl group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs group-hover:text-blue-700 transition">
                      {t(action.label)}
                    </span>
                    <span className="text-xs text-blue-500 group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{action.desc}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No action assigned here yet"
            copy="Your Project Director can grant additional module access when work is assigned to you."
          />
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Authorized CTMS Workspace Modules                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{t('home.workspace')}</h2>
          <p className="text-xs text-slate-500">{t('home.authorized')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleCards.map(card => (
            <button
              key={card.tab}
              onClick={() => onNavigate(card.tab)}
              className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl group-hover:bg-blue-100 group-hover:text-blue-700 transition">
                  {card.icon}
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-xs group-hover:text-blue-700 transition">{card.title}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{card.copy}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 text-center">
      <p className="font-bold text-slate-800">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{copy}</p>
    </div>
  );
}

