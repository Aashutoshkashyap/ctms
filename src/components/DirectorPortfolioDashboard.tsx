import React, { useCallback, useMemo, useState } from 'react';
import { Activity } from '../lib/cpm';
import { AppNotification, DailyExpense, DailyResourceUsage, EmployeeVisit, storage } from '../lib/storage';
import { formatBsDateTime } from '../lib/nepaliDate';
import { useLanguage } from './LanguageProvider';
import { calculateProjectFinancials, calculateProjectProgress } from '../lib/projectMetrics';

interface Props {
  projects: any[];
  activeProjectId: string;
  activities: Array<Activity & { project_id?: string }>;
  expenses: DailyExpense[];
  resourceUsage: DailyResourceUsage[];
  visits: EmployeeVisit[];
  alerts: Array<{ type: string; message: string; severity: string }>;
  onSwitchProject: (id: string) => void;
  onNavigate: (tab: string) => void;
  onReload: () => void;
}

function projectRowsFor<T extends { project_id?: string }>(rows: T[], projectId: string) {
  return rows.filter(row => row.project_id === projectId);
}

export default function DirectorPortfolioDashboard({
  projects,
  activeProjectId,
  activities,
  expenses,
  resourceUsage,
  visits,
  alerts,
  onSwitchProject,
  onNavigate,
  onReload,
}: Props) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<AppNotification[]>(() => storage.getAllNotifications(50));
  const makeProjectRow = useCallback((project: any) => {
    const projectActivities = projectRowsFor(activities, project.id);
    const projectExpenses = projectRowsFor(expenses, project.id).filter(item => item.status !== 'rejected');
    const projectResources = projectRowsFor(resourceUsage, project.id);
    const completedActivities = projectActivities.filter(item => item.status === 'completed').length;
    const delayed = projectActivities.filter(item => item.status !== 'completed' && new Date().toISOString().slice(0, 10) > item.baseline_finish).length;
    const fuel = projectResources.reduce((sum, item) => sum + Number(item.fuel_litres || 0), 0);
    const work = projectResources.reduce((sum, item) => sum + Number(item.work_quantity || 0), 0);
    const financials = calculateProjectFinancials({ contractAmount: project.contract_amount, expenses: projectExpenses });
    const budgetSpent = financials.expenseTotal;
    const contractAmount = financials.contractAmount;
    const completion = projectActivities.length ? (completedActivities / projectActivities.length) * 100 : 0;
    return {
      project,
      activities: projectActivities.length,
      completedActivities,
      delayed,
      cost: budgetSpent,
      budgetSpent,
      contractAmount,
      budgetSpentPct: contractAmount ? (budgetSpent / contractAmount) * 100 : 0,
      progress: projectActivities.length ? calculateProjectProgress(projectActivities, new Date().toISOString().slice(0, 10)).actualProgress : 0,
      completion,
      workFuel: fuel ? work / fuel : 0,
      visits: projectRowsFor(visits, project.id).filter(item => item.status === 'on_site').length,
    };
  }, [activities, expenses, resourceUsage, visits]);
  const portfolio = useMemo(() => projects.filter(project => project.status !== 'archived').map(makeProjectRow), [projects, makeProjectRow]);
  const archivedPortfolio = useMemo(() => projects.filter(project => project.status === 'archived').map(makeProjectRow), [projects, makeProjectRow]);

  const totals = useMemo(() => ({
    projects: portfolio.length,
    contract: portfolio.reduce((sum, row) => sum + Number(row.project.contract_amount || 0), 0),
    cost: portfolio.reduce((sum, row) => sum + row.cost, 0),
    delayed: portfolio.reduce((sum, row) => sum + row.delayed, 0),
    archived: archivedPortfolio.length,
  }), [portfolio, archivedPortfolio]);

  const archive = async (id: string) => {
    if (!confirm('Archive this project from active portfolio view?')) return;
    try {
      await storage.archiveProject(id);
      onReload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not archive the project.');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Permanently delete this project and all linked database records? This cannot be undone.')) return;
    try {
      await storage.deleteProject(id);
      onReload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not delete the project.');
    }
  };

  const restore = async (id: string) => {
    try {
      await storage.restoreProject(id);
      onReload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not restore the project.');
    }
  };

  const markRead = () => {
    storage.markAllNotificationsRead();
    setNotifications(storage.getAllNotifications(50));
  };

  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | 'on_track' | 'delayed'>('all');

  const filteredPortfolio = useMemo(() => {
    return portfolio.filter(row => {
      if (tableFilter === 'on_track' && row.delayed > 0) return false;
      if (tableFilter === 'delayed' && row.delayed === 0) return false;
      if (!tableSearch.trim()) return true;
      const q = tableSearch.toLowerCase();
      return row.project.name.toLowerCase().includes(q) || (row.project.contract_number && row.project.contract_number.toLowerCase().includes(q));
    });
  }, [portfolio, tableFilter, tableSearch]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 md:p-6 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-50 to-indigo-50/20 -z-0 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                Director Command Centre
              </span>
              <span className="text-xs text-slate-500 font-medium">· Multi-Project Portfolio</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Enterprise Portfolio Overview</h1>
            <p className="mt-1 max-w-2xl text-xs md:text-sm text-slate-600 leading-relaxed">
              Real-time portfolio health, contract values, field delay warnings, and cross-project commercial controls.
            </p>
          </div>
          <button
            onClick={() => onNavigate('settings')}
            className="self-start md:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <span>👥</span> Manage Team &amp; Projects
          </button>
        </div>
      </section>

      {/* 2. 4 Colorful Stat Summary Cards (SilverLogix style) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Projects */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl">
              🏢
            </div>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
              Active Sites
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Active Projects</div>
            <div className="text-3xl font-black text-slate-900 mt-1">{totals.projects}</div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
            {totals.archived} archived project{totals.archived === 1 ? '' : 's'} on record
          </div>
        </div>

        {/* Card 2: Contract Portfolio Value */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl">
              📊
            </div>
            <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
              Contract Value
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Portfolio Value</div>
            <div className="text-3xl font-black text-slate-900 mt-1">
              NPR {(totals.contract / 1_000_000).toFixed(1)}m
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Committed construction contracts
          </div>
        </div>

        {/* Card 3: Costs Logged */}
        <button
          onClick={() => onNavigate('expenses')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:shadow-md hover:border-amber-300 transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
              💳
            </div>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
              Site Costs
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Incurred Costs</div>
            <div className="text-3xl font-black text-slate-900 mt-1">
              NPR {(totals.cost / 1_000_000).toFixed(1)}m
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Verified expenditures</span>
            <span className="text-amber-700 font-bold group-hover:translate-x-1 transition-transform">Audit →</span>
          </div>
        </button>

        {/* Card 4: Delayed Work Items */}
        <button
          onClick={() => onNavigate('cpm')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:shadow-md hover:border-rose-300 transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
              ⚠️
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${totals.delayed > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {totals.delayed > 0 ? 'Action Required' : 'On Schedule'}
            </span>
          </div>
          <div className="mt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delayed Milestones</div>
            <div className={`text-3xl font-black mt-1 ${totals.delayed > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {totals.delayed}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className={totals.delayed > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
              {totals.delayed > 0 ? 'Across portfolio schedule' : 'All critical paths clear'}
            </span>
            <span className="text-rose-700 font-bold group-hover:translate-x-1 transition-transform">Open schedule →</span>
          </div>
        </button>
      </section>

      {/* 3. Director Priority Attention */}
      <section aria-labelledby="director-attention" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-3">
          <h2 id="director-attention" className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            {t('director.attention')}
          </h2>
          <p className="text-xs text-slate-500">Fast action queues across all active sites.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <button
            onClick={() => onNavigate('cpm')}
            className="flex items-center gap-3.5 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-left hover:bg-rose-100/60 transition group"
          >
            <span className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-lg shrink-0">
              📅
            </span>
            <div>
              <div className="font-bold text-rose-950 text-xs">
                {t('director.delays')} · {totals.delayed} Overdue
              </div>
              <div className="text-[11px] text-rose-800 mt-0.5">{t('director.openSchedule')}</div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('expenses')}
            className="flex items-center gap-3.5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-left hover:bg-amber-100/60 transition group"
          >
            <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg shrink-0">
              💳
            </span>
            <div>
              <div className="font-bold text-amber-950 text-xs">{t('director.costs')}</div>
              <div className="text-[11px] text-amber-800 mt-0.5">{t('director.openCosts')}</div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('reports')}
            className="flex items-center gap-3.5 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-left hover:bg-blue-100/60 transition group"
          >
            <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-lg shrink-0">
              📤
            </span>
            <div>
              <div className="font-bold text-blue-950 text-xs">{t('director.reports')}</div>
              <div className="text-[11px] text-blue-800 mt-0.5">{t('director.openReports')}</div>
            </div>
          </button>
        </div>
      </section>

      {/* 4. Active Project Cards Grid */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {portfolio.map(row => {
          const isSelected = row.project.id === activeProjectId;
          return (
            <div
              key={row.project.id}
              className={`rounded-2xl border bg-white p-5 shadow-xs transition ${
                isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isSelected && <span className="w-2 h-2 rounded-full bg-blue-600" title="Currently Selected Project" />}
                    <h3 className="font-bold text-slate-900 text-sm truncate">{row.project.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{row.project.contract_number || 'Contract No. Pending'}</p>
                </div>
                <span className={`status-pill ${row.delayed ? 'status-pill-delayed' : 'status-pill-completed'} shrink-0`}>
                  <span className="status-pill-dot" />
                  {row.delayed ? `${row.delayed} Delayed` : 'On Track'}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold text-slate-600">Work Completed</span>
                    <span className="font-mono font-bold text-blue-600">{row.progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold text-slate-600">Budget Consumed</span>
                    <span className={`font-mono font-bold ${row.budgetSpentPct > row.progress + 10 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {row.budgetSpentPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${row.budgetSpentPct > row.progress + 10 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, row.budgetSpentPct))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="text-slate-500">
                  <span className="font-bold text-slate-800">{row.completedActivities}/{row.activities}</span> tasks
                </div>
                <button
                  onClick={() => onSwitchProject(row.project.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {isSelected ? 'Active Workspace' : 'Open Workspace →'}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* 5. Detailed Project Portfolio Table & Notifications Grid */}
      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* Left Column: Data Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Project Portfolio Master Table</h2>
              <p className="text-xs text-slate-500">Comparative metrics across all active construction projects</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Search project..."
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 min-h-0 w-36 sm:w-44"
              />
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
                {(['all', 'on_track', 'delayed'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setTableFilter(tab)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs capitalize transition ${
                      tableFilter === tab
                        ? 'bg-white text-blue-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab === 'on_track' ? 'On Track' : tab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Project &amp; Ref</th>
                  <th className="py-3 px-4">Work Progress</th>
                  <th className="py-3 px-4">Spend vs Budget</th>
                  <th className="py-3 px-4">Delayed</th>
                  <th className="py-3 px-4">Fuel Efficiency</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPortfolio.map(row => (
                  <tr key={row.project.id} className={`hover:bg-blue-50/30 transition ${row.project.id === activeProjectId ? 'bg-blue-50/40' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{row.project.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{row.project.contract_number || 'No contract no.'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.progress}%` }} />
                        </div>
                        <span className="font-bold text-slate-700">{row.progress.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">NPR {row.budgetSpent.toLocaleString()}</div>
                      <div className="text-[11px] text-slate-500">{row.budgetSpentPct.toFixed(1)}% of budget</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`status-pill ${row.delayed ? 'status-pill-delayed' : 'status-pill-completed'}`}>
                        <span className="status-pill-dot" />
                        {row.delayed ? `${row.delayed} Overdue` : 'Clear'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">
                      {row.workFuel ? `${row.workFuel.toFixed(2)} u/L` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onSwitchProject(row.project.id)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => archive(row.project.id)}
                          className="px-2 py-1 text-slate-600 hover:text-amber-700 font-bold rounded-lg transition"
                        >
                          Archive
                        </button>
                        <button
                          onClick={() => remove(row.project.id)}
                          className="px-2 py-1 text-slate-400 hover:text-rose-700 font-bold rounded-lg transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Notifications & Priority Alerts Sidebar */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Activity Updates</h2>
              <button onClick={markRead} className="text-xs font-bold text-blue-600 hover:text-blue-800">
                Mark read
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No recent activity.</p>
              ) : (
                notifications.slice(0, 8).map(note => (
                  <div
                    key={note.id}
                    className={`rounded-xl border p-2.5 text-xs transition ${
                      note.read ? 'border-slate-100 bg-slate-50/50' : 'border-blue-200 bg-blue-50/50'
                    }`}
                  >
                    <div className="font-bold text-slate-900">{note.action}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {note.module} · {note.actor || 'User'} · {formatBsDateTime(note.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-xs space-y-2">
              <h2 className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
                <span>🚨</span> Portfolio Alerts
              </h2>
              <div className="space-y-1.5">
                {alerts.slice(0, 4).map((alert, idx) => (
                  <div key={`${alert.type}-${idx}`} className="rounded-xl bg-white border border-rose-200 p-2.5 text-xs shadow-2xs">
                    <b className="text-rose-700">{alert.type}:</b> {alert.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>

      {/* 6. Archived Projects Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Archived Projects</h2>
          <p className="text-xs text-slate-500">Closed or paused projects stay visible here for audit and can be restored anytime.</p>
        </div>
        {archivedPortfolio.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 text-center">
            No archived projects on record.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Project Name</th>
                  <th className="py-2.5 px-4">Completion</th>
                  <th className="py-2.5 px-4">Total Cost</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {archivedPortfolio.map(row => (
                  <tr key={row.project.id}>
                    <td className="py-2.5 px-4">
                      <b className="text-slate-900">{row.project.name}</b>
                      <div className="text-[10px] text-slate-500">{row.project.contract_number || 'No contract no.'}</div>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-700">{row.progress.toFixed(1)}%</td>
                    <td className="py-2.5 px-4 font-mono">NPR {row.budgetSpent.toLocaleString()}</td>
                    <td className="py-2.5 px-4">
                      <span className="status-pill status-pill-neutral">
                        <span className="status-pill-dot" />
                        Archived
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => restore(row.project.id)}
                        className="px-2.5 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100 font-bold rounded-lg transition"
                      >
                        Restore Project
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
