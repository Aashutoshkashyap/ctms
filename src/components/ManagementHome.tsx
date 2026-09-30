'use client';

import { BarChart } from '@mui/x-charts/BarChart';
import type { Activity } from '../lib/cpm';
import type { DailyExpense, DailyResourceUsage } from '../lib/storage';
import { storage } from '../lib/storage';
import { EmptyState, MetricCard, ModuleCard, PageHeader, SectionHeader, StatusBadge } from './ManagementUI';

type Project = { id: string; name: string; status?: string; contract_amount?: number; location?: string; client?: string };
type ProjectActivity = Activity & { project_id?: string };
type Alert = { type: string; message: string; severity: string };
type Entry = { label: string; icon: string; tab: string; description: string };

const number = (value: number) => Number.isFinite(value) ? value : 0;
const money = (value: number) => `NPR ${Math.round(number(value)).toLocaleString()}`;
const active = (project: Project) => project.status !== 'archived';
const taskProgress = (activities: Activity[]) => activities.length ? Math.round(activities.filter(item => item.status === 'completed').length / activities.length * 100) : null;

export function ManagementHome({ projects, currentProject, activities, expenses, resourceUsage, usersCount, alerts, entries, portfolio, canSeeCommercial, onNavigate }: {
  projects: Project[];
  currentProject: Project;
  activities: ProjectActivity[];
  expenses: DailyExpense[];
  resourceUsage: DailyResourceUsage[];
  usersCount: number;
  alerts: Alert[];
  entries: Entry[];
  portfolio: boolean;
  canSeeCommercial: boolean;
  onNavigate: (tab: string) => void;
}) {
  const visibleProjects = portfolio ? projects.filter(active) : [currentProject];
  const projectIds = new Set(visibleProjects.map(item => item.id));
  const authorizedActivities = activities.filter(item => item.project_id && projectIds.has(item.project_id));
  const authorizedExpenses = canSeeCommercial ? expenses.filter(item => item.project_id && projectIds.has(item.project_id) && item.status !== 'rejected') : [];
  const currentActivities = activities.filter(item => item.project_id === currentProject.id);
  const currentExpenses = expenses.filter(item => item.project_id === currentProject.id && item.status !== 'rejected');
  const projectRows = visibleProjects.map(item => ({
    id: item.id,
    name: item.name,
    progress: taskProgress(activities.filter(activity => activity.project_id === item.id)),
  }));
  const pending = alerts.filter(item => item.severity !== 'info');
  const available = (label: string) => entries.some(item => item.label === label);
  const documents = available('Document Vault') ? storage.getDocuments() : [];
  const documentsNeedingReview = documents.filter(item => item.status === 'under_review').length;
  const inventoryLow = available('Inventory') ? storage.getStoreItems().filter(item => (item.current_stock ?? item.opening_stock + item.received - item.issued) <= item.reorder_level && item.status !== 'inactive').length : 0;
  const openOrders = available('Purchases') ? storage.getProcurementOrders().filter(item => !['delivered', 'cancelled'].includes(item.status)).length : 0;
  const projectExpense = currentExpenses.reduce((sum, item) => sum + number(Number(item.amount)), 0);
  const portfolioExpense = authorizedExpenses.reduce((sum, item) => sum + number(Number(item.amount)), 0);
  const currentProgress = taskProgress(currentActivities);
  const moduleDetails: Record<string, string> = {
    People: `${usersCount} project people`,
    Work: currentProgress === null ? 'No work items yet' : `${currentProgress}% of tasks complete`,
    Fleet: `${resourceUsage.filter(item => item.project_id === currentProject.id).length} usage logs`,
    Inventory: inventoryLow ? `${inventoryLow} low-stock items` : 'Stock and movements',
    Purchases: `${openOrders} open orders`,
    Commercial: canSeeCommercial ? `${money(projectExpense)} expenses logged` : 'Costs, billing and contracts',
    'Document Vault': documentsNeedingReview ? `${documentsNeedingReview} documents in review` : 'Files and evidence',
  };

  return <div className="space-y-8">
    <PageHeader eyebrow={portfolio ? 'Organization overview' : 'Your project'} title={portfolio ? 'Good decisions start here' : `Today at ${currentProject.name}`} description={portfolio ? 'Projects, work and spending in one clear view. Open an area below to take action.' : 'The essentials for your current project, with direct access to the work that needs you.'} action={<button type="button" onClick={() => onNavigate('projects')} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">View projects →</button>} />

    <section aria-label="Management summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label={portfolio ? 'Active projects' : 'Current project'} value={portfolio ? String(visibleProjects.length) : currentProject.name} note={portfolio ? `${projects.length - visibleProjects.length} archived` : currentProject.status || 'Active'} icon="🏗️" />
      <MetricCard label="Tasks complete" value={authorizedActivities.length ? `${authorizedActivities.filter(item => item.status === 'completed').length} / ${authorizedActivities.length}` : '—'} note={portfolio ? 'Across your projects' : 'Current project'} icon="✓" tone="green" />
      {canSeeCommercial ? <MetricCard label="Expenses logged" value={money(portfolio ? portfolioExpense : projectExpense)} note="Excludes rejected expenses; not a payment balance" icon="₨" tone="slate" /> : <MetricCard label="Project people" value={String(usersCount)} note="Current project members" icon="👥" tone="slate" />}
      <MetricCard label="Needs attention" value={String(pending.length)} note="Current project alerts" icon="!" tone={pending.length ? 'amber' : 'green'} />
    </section>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,1fr)]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader title={portfolio ? 'Project work completed' : 'Current project progress'} description="Based on completed work items; not certified financial progress." />
        {portfolio && projectRows.filter(row => row.progress !== null).length > 1 ? <div className="mt-4 h-64 w-full" role="img" aria-label="Completed work items by project">
          <BarChart layout="horizontal" height={256} yAxis={[{ scaleType: 'band', data: projectRows.filter(row => row.progress !== null).slice(0, 6).map(row => row.name) }]} xAxis={[{ min: 0, max: 100, valueFormatter: (value: number) => `${value}%` }]} series={[{ data: projectRows.filter(row => row.progress !== null).slice(0, 6).map(row => row.progress || 0), label: 'Tasks complete', color: '#2563eb' }]} borderRadius={4} grid={{ vertical: true }} skipAnimation />
        </div> : currentProgress === null ? <div className="mt-5"><EmptyState title="No work progress to show" description="Add work items in Work to start tracking completion." /></div> : <div className="mt-8"><div className="flex items-baseline justify-between"><span className="text-sm font-medium text-slate-600">Tasks completed</span><span className="text-3xl font-bold text-slate-950">{currentProgress}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${currentProgress}%` }} /></div><p className="mt-3 text-xs text-slate-500">{currentActivities.filter(item => item.status === 'completed').length} of {currentActivities.length} work items completed</p></div>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader title="Attention now" description="Current project actions worth checking." action={<button type="button" onClick={() => onNavigate('notifications')} className="text-sm font-semibold text-blue-800 hover:underline">Open inbox</button>} />
        {pending.length ? <ul className="mt-4 divide-y divide-slate-100">{pending.slice(0, 4).map((item, index) => <li key={`${item.type}-${index}`} className="py-3"><StatusBadge label={item.type} tone="amber" /><p className="mt-2 text-sm leading-5 text-slate-700">{item.message}</p></li>)}</ul> : <div className="mt-5"><EmptyState title="Nothing urgent here" description="New project alerts will appear in your inbox." /></div>}
      </section>
    </div>

    <section className="space-y-4"><SectionHeader title="Management areas" description="Open the area you need. Your existing permissions still decide what you can see and change." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{entries.map(item => <ModuleCard key={item.label} icon={item.icon} title={item.label} description={item.description} detail={moduleDetails[item.label]} onClick={() => onNavigate(item.tab)} />)}</div></section>
  </div>;
}

export function ProjectOverview({ project, activities, expenses, resources, entries, canSeeCommercial, onNavigate }: { project: Project; activities: ProjectActivity[]; expenses: DailyExpense[]; resources: DailyResourceUsage[]; entries: Array<{ label: string; tab: string }>; canSeeCommercial: boolean; onNavigate: (tab: string) => void }) {
  const currentActivities = activities.filter(item => item.project_id === project.id);
  const currentExpenses = expenses.filter(item => item.project_id === project.id && item.status !== 'rejected');
  const progress = taskProgress(currentActivities);
  const spent = currentExpenses.reduce((sum, item) => sum + number(Number(item.amount)), 0);
  const contract = number(Number(project.contract_amount || 0));
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Selected project</p><h2 className="mt-1 text-xl font-bold text-slate-950">{project.name}</h2><p className="mt-1 text-sm text-slate-600">{[project.client, project.location].filter(Boolean).join(' · ') || 'Open the project areas below to review current records.'}</p></div><StatusBadge label={project.status || 'Active'} tone={project.status === 'archived' ? 'slate' : 'green'} /></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Tasks complete" value={progress === null ? '—' : `${progress}%`} note={`${currentActivities.length} work items`} icon="✓" tone="green" />{canSeeCommercial && <><MetricCard label="Contract value" value={money(contract)} note="Original project value" icon="₨" /><MetricCard label="Expenses logged" value={money(spent)} note="Excludes rejected expenses" icon="↗" tone="slate" /></>}<MetricCard label="Equipment usage" value={String(resources.filter(item => item.project_id === project.id).length)} note="Daily usage records" icon="🚜" /></div>
    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">{entries.map(({ tab, label }) => <button key={tab} type="button" onClick={() => onNavigate(tab)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-800">{label} →</button>)}</div>
  </section>;
}
