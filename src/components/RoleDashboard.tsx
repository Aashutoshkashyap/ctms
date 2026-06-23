import React, { useMemo } from 'react';
import { Activity } from '../lib/cpm';
import { DailyExpense, DailyResourceUsage, EmployeeVisit } from '../lib/storage';
import { can, normalizeRole, ROLE_HOME_COPY, ROLE_LABELS } from '../lib/permissions';

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
}

const moduleCards = [
  { feature: 'schedule', tab: 'cpm', icon: '📅', title: 'Programme & Gantt', copy: 'WBS, logic, progress and delay remarks.' },
  { feature: 'daily_reports', tab: 'daily', icon: '📝', title: 'Daily Reporting', copy: 'Completed work, constraints and site evidence.' },
  { feature: 'operations', tab: 'operations', icon: '🚜', title: 'Resources & Productivity', copy: 'Plant, manpower, fuel and excavator efficiency.' },
  { feature: 'finance', tab: 'finance', icon: '📉', title: 'Finance Model', copy: 'Cash flow, cost curves and accumulated position.' },
  { feature: 'expenses', tab: 'expenses', icon: '🧾', title: 'Daily Cost Records', copy: 'Date-based site expenditure and approvals.' },
  { feature: 'procurement', tab: 'procurement', icon: '🚚', title: 'Procurement & Stores', copy: 'Orders, deliveries, issues and stock levels.' },
  { feature: 'qaqc', tab: 'qaqc', icon: '🧪', title: 'Quality Control', copy: 'Inspections, tests, NCRs and verification.' },
  { feature: 'safety', tab: 'safety', icon: '🦺', title: 'Safety Controls', copy: 'Incidents, permits, visits and workforce checks.' },
  { feature: 'view_evidence', tab: 'evidence', icon: '🖼️', title: 'Director Evidence Vault', copy: 'Private project photographs and verification files.' },
  { feature: 'settings', tab: 'settings', icon: '⚙️', title: 'Project Administration', copy: 'Users, roles, project setup and cloud connection.' },
] as const;

export default function RoleDashboard({ role, userName, project, activities, expenses, resourceUsage, visits, alerts, onNavigate }: Props) {
  const normalizedRole = normalizeRole(role);
  const copy = ROLE_HOME_COPY[normalizedRole];
  const metrics = useMemo(() => {
    const approvedExpenses = expenses.filter(item => item.status === 'approved');
    const today = new Date().toISOString().slice(0, 10);
    const activeActivities = activities.filter(item => item.status === 'in_progress').length;
    const delayedActivities = activities.filter(item => {
      const forecastDelay = (item.early_finish || item.baseline_finish) > item.baseline_finish;
      const overdue = item.status !== 'completed' && today > item.baseline_finish;
      return forecastDelay || overdue;
    }).length;
    const fuel = resourceUsage.reduce((sum, item) => sum + item.fuel_litres, 0);
    const work = resourceUsage.reduce((sum, item) => sum + item.work_quantity, 0);
    return {
      activeActivities,
      delayedActivities,
      accumulatedCost: approvedExpenses.reduce((sum, item) => sum + item.amount, 0),
      pendingCost: expenses.filter(item => item.status === 'submitted').reduce((sum, item) => sum + item.amount, 0),
      fuelEfficiency: fuel > 0 ? work / fuel : 0,
      todayVisits: visits.filter(item => item.visit_date === today && item.status !== 'cancelled').length,
    };
  }, [activities, expenses, resourceUsage, visits]);

  const visibleCards = moduleCards.filter(card => can(role, card.feature));
  const metricCards = [
    ...(can(role, 'schedule') || can(role, 'executive') ? [
      { label: 'Active Work', value: String(metrics.activeActivities), warning: false },
      { label: 'Delayed Activities', value: String(metrics.delayedActivities), warning: metrics.delayedActivities > 0 },
    ] : []),
    ...(can(role, 'finance') || can(role, 'expenses') || can(role, 'executive') ? [
      { label: 'Accumulated Cost', value: `NPR ${(metrics.accumulatedCost / 1_000_000).toFixed(2)}m`, warning: false },
      { label: 'Pending Approval', value: `NPR ${(metrics.pendingCost / 1_000_000).toFixed(2)}m`, warning: metrics.pendingCost > 0 },
    ] : []),
    ...(can(role, 'operations') || can(role, 'executive') ? [
      { label: 'Work / Fuel', value: `${metrics.fuelEfficiency.toFixed(2)} unit/L`, warning: false },
    ] : []),
    ...(can(role, 'employee_tracking') || can(role, 'executive') ? [
      { label: 'Visits Today', value: String(metrics.todayVisits), warning: false },
    ] : []),
    { label: 'Authorized Modules', value: String(visibleCards.length), warning: false },
  ];

  return <div className="space-y-6">
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-r from-white to-blue-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{ROLE_LABELS[normalizedRole]}</span>
          <h1 className="mt-3 text-2xl font-extrabold text-slate-900">{copy.title}</h1>
          <p className="mt-1 max-w-3xl text-slate-600">{copy.subtitle}</p>
        </div>
        <div className="text-left md:text-right">
          <div className="font-bold text-slate-900">{userName}</div>
          <div className="text-sm text-slate-500">{project.name}</div>
        </div>
      </div>
    </section>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
      {metricCards.map(card => <Metric key={card.label} label={card.label} value={card.value} warning={card.warning} />)}
    </section>

    {alerts.length > 0 && can(role, 'executive') && <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <h2 className="font-bold text-rose-800">Priority attention</h2>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {alerts.slice(0, 4).map((alert, index) => <div key={`${alert.type}-${index}`} className="rounded-lg bg-white p-3 text-sm text-slate-700 shadow-sm">
          <b className="text-rose-700">{alert.type}:</b> {alert.message}
        </div>)}
      </div>
    </section>}

    <section>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-slate-900">Your workspace</h2>
        <p className="text-sm text-slate-500">Only modules authorized for this role are shown.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map(card => <button key={card.tab} onClick={() => onNavigate(card.tab)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl group-hover:bg-blue-100">{card.icon}</span>
            <div><h3 className="font-bold text-slate-900">{card.title}</h3><p className="mt-1 text-sm text-slate-500">{card.copy}</p></div>
          </div>
        </button>)}
      </div>
    </section>
  </div>;
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-xl border bg-white p-4 shadow-sm ${warning ? 'border-amber-300' : 'border-slate-200'}`}>
    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`mt-1 text-lg font-extrabold ${warning ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
  </div>;
}
