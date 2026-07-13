import React, { useCallback, useMemo, useState } from 'react';
import { Activity } from '../lib/cpm';
import { AppNotification, DailyExpense, DailyResourceUsage, EmployeeVisit, storage } from '../lib/storage';
import { formatBsDateTime } from '../lib/nepaliDate';

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
  const [notifications, setNotifications] = useState<AppNotification[]>(() => storage.getAllNotifications(50));
  const makeProjectRow = useCallback((project: any) => {
    const projectActivities = projectRowsFor(activities, project.id);
    const projectExpenses = projectRowsFor(expenses, project.id).filter(item => item.status !== 'rejected');
    const projectResources = projectRowsFor(resourceUsage, project.id);
    const completedActivities = projectActivities.filter(item => item.status === 'completed').length;
    const delayed = projectActivities.filter(item => item.status !== 'completed' && new Date().toISOString().slice(0, 10) > item.baseline_finish).length;
    const progressWeight = projectActivities.reduce((sum, item) => sum + (item.planned_quantity ? (item.actual_quantity / item.planned_quantity) * item.weightage : 0), 0);
    const fuel = projectResources.reduce((sum, item) => sum + Number(item.fuel_litres || 0), 0);
    const work = projectResources.reduce((sum, item) => sum + Number(item.work_quantity || 0), 0);
    const budgetSpent = projectExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const contractAmount = Number(project.contract_amount || 0);
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
      progress: Math.min(100, progressWeight || completion),
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

  return <div className="space-y-6">
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-r from-white via-blue-50 to-indigo-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">Director only</span>
          <h1 className="mt-3 text-2xl font-extrabold text-slate-900">All-project command centre</h1>
          <p className="mt-1 text-slate-600">Portfolio health, cost, activity alerts, employee movement and latest actions across every project in one place.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Projects" value={String(totals.projects)} />
          <Metric label="Contract Value" value={`NPR ${(totals.contract / 1_000_000).toFixed(1)}m`} />
          <Metric label="Costs Logged" value={`NPR ${(totals.cost / 1_000_000).toFixed(1)}m`} />
          <Metric label="Delayed Items" value={String(totals.delayed)} warning={totals.delayed > 0} />
          <Metric label="Archived" value={String(totals.archived)} />
        </div>
      </div>
    </section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {portfolio.map(row => <div key={row.project.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">{row.project.name}</h3>
            <p className="text-xs text-slate-500">{row.project.contract_number || 'No contract number'}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.delayed ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{row.delayed ? 'Delayed' : 'On track'}</span>
        </div>
        <div className="mt-4 space-y-3">
          <Progress label="Work completed" value={row.progress} tone="blue" />
          <Progress label="Budget spent" value={row.budgetSpentPct} tone={row.budgetSpentPct > row.progress + 10 ? 'rose' : 'emerald'} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <Mini label="Done" value={`${row.completedActivities}/${row.activities}`} />
          <Mini label="Spent" value={`${(row.budgetSpent / 1_000_000).toFixed(1)}m`} />
          <Mini label="Delay" value={String(row.delayed)} warning={row.delayed > 0} />
        </div>
      </div>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Project portfolio</h2>
          <button onClick={() => onNavigate('settings')} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Manage users/projects</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">{['Project','Work Completed','Budget Spent','Activities','Delay','Work/Fuel','On-site','Action'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
            <tbody>{portfolio.map(row => <tr key={row.project.id} className={row.project.id === activeProjectId ? 'bg-blue-50' : ''}>
              <td className="p-2"><b className="text-slate-900">{row.project.name}</b><div className="text-xs text-slate-500">{row.project.contract_number || 'No contract no.'}</div></td>
              <td className="p-2"><div className="h-2 w-32 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.progress}%` }} /></div><span className="text-xs text-slate-500">{row.progress.toFixed(1)}%</span></td>
              <td className="p-2"><b>NPR {row.budgetSpent.toLocaleString()}</b><div className="text-xs text-slate-500">{row.budgetSpentPct.toFixed(1)}% of budget</div></td>
              <td className="p-2">{row.completedActivities}/{row.activities}</td>
              <td className={`p-2 font-bold ${row.delayed ? 'text-rose-700' : 'text-emerald-700'}`}>{row.delayed}</td>
              <td className="p-2">{row.workFuel ? row.workFuel.toFixed(2) : '—'}</td>
              <td className="p-2">{row.visits}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => onSwitchProject(row.project.id)} className="text-blue-700 font-bold">Open</button>
                  <button onClick={() => archive(row.project.id)} className="text-amber-700 font-bold">Archive</button>
                  <button onClick={() => remove(row.project.id)} className="text-rose-700 font-bold">Delete</button>
                </div>
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Notifications</h2>
            <button onClick={markRead} className="text-xs font-bold text-blue-700">Mark read</button>
          </div>
          <div className="mt-3 space-y-2">
            {notifications.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : notifications.slice(0, 10).map(note => <div key={note.id} className={`rounded-lg border p-3 text-sm ${note.read ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-blue-50'}`}>
              <div className="font-bold text-slate-900">{note.action}</div>
              <div className="text-xs text-slate-500">{note.module} · {note.actor || 'User'} · {formatBsDateTime(note.created_at)}</div>
            </div>)}
          </div>
        </div>
        {alerts.length > 0 && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <h2 className="font-bold text-rose-800">Priority alerts</h2>
          <div className="mt-2 space-y-2">{alerts.slice(0, 5).map((alert, index) => <div key={`${alert.type}-${index}`} className="rounded-lg bg-white p-3 text-sm text-slate-700"><b>{alert.type}:</b> {alert.message}</div>)}</div>
        </div>}
      </aside>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-bold text-slate-900">Archived projects</h2>
      <p className="text-sm text-slate-500">Closed or paused projects stay visible here for Director review and can be restored.</p>
      <div className="mt-3 overflow-x-auto">
        {archivedPortfolio.length === 0 ? <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No archived projects yet.</div> : <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">{['Project','Completion','Budget Spent','Archived Status','Action'].map(title => <th key={title} className="p-2">{title}</th>)}</tr></thead>
          <tbody>{archivedPortfolio.map(row => <tr key={row.project.id} className="border-b border-slate-100">
            <td className="p-2"><b>{row.project.name}</b><div className="text-xs text-slate-500">{row.project.contract_number || 'No contract no.'}</div></td>
            <td className="p-2">{row.progress.toFixed(1)}%</td>
            <td className="p-2">NPR {row.budgetSpent.toLocaleString()}</td>
            <td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">Archived</span></td>
            <td className="p-2"><button onClick={() => restore(row.project.id)} className="font-bold text-blue-700">Restore</button></td>
          </tr>)}</tbody>
        </table>}
      </div>
    </section>
  </div>;
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
    <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
    <div className={`text-lg font-extrabold ${warning ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
  </div>;
}

function Progress({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'emerald' | 'rose' }) {
  const color = tone === 'rose' ? 'bg-rose-600' : tone === 'emerald' ? 'bg-emerald-600' : 'bg-blue-600';
  return <div>
    <div className="mb-1 flex justify-between text-xs"><span className="font-bold text-slate-600">{label}</span><span className="font-mono text-slate-500">{Math.min(100, value).toFixed(1)}%</span></div>
    <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
  </div>;
}

function Mini({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="rounded-lg bg-slate-50 p-2">
    <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
    <div className={`font-extrabold ${warning ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
  </div>;
}
