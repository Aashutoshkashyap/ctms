import React, { useMemo } from 'react';
import { Activity } from '../lib/cpm';
import { DailyExpense, DailyResourceUsage, storage } from '../lib/storage';
import PeopleAssignments from './PeopleAssignments';
import WorkBoard from './work/WorkBoard';
import { workItems } from '../lib/workAdapter';
import DepartmentsWorkspace from './DepartmentsWorkspace';
import NotificationCenter from './NotificationCenter';
// Department routes remain available through the UX-4 workspace: tab:'procurement' tab:'budget' tab:'documents' tab:'claims'.

type Navigate = (tab: string) => void;

const money = (value: number) => `NPR ${Math.round(value).toLocaleString()}`;

function Card({ icon, title, value, note, onClick }: { icon: string; title: string; value: string; note: string; onClick?: () => void }) {
  const content = <><span className="text-2xl" aria-hidden>{icon}</span><div className="min-w-0"><p className="font-bold text-slate-950">{title}</p><p className="mt-1 text-lg font-extrabold text-slate-900">{value}</p><p className="text-xs text-slate-500">{note}</p></div></>;
  return onClick ? <button onClick={onClick} className="flex min-h-28 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">{content}</button> : <div className="flex min-h-28 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{content}</div>;
}

function ProgressBars({ activities }: { activities: Activity[] }) {
  const values = useMemo(() => {
    const total = activities.reduce((sum, activity) => sum + Math.max(0, Number(activity.planned_quantity || 0)), 0);
    const actual = activities.reduce((sum, activity) => sum + Math.max(0, Number(activity.actual_quantity || 0)), 0);
    const planned = activities.reduce((sum, activity) => sum + Math.max(0, Number(activity.planned_quantity || 0) * Math.min(1, Math.max(0, Number(activity.weightage || 0) / 100))), 0);
    return { actual: total ? Math.min(100, Math.round((actual / total) * 100)) : 0, planned: total ? Math.min(100, Math.round((planned / total) * 100)) : 0 };
  }, [activities]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-950">Progress</h3><p className="text-sm text-slate-500">Planned work compared with completed work</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-800">{values.actual}% done</span></div><div className="mt-5 space-y-4"><Progress label="Planned" value={values.planned} color="bg-sky-500"/><Progress label="Completed" value={values.actual} color="bg-emerald-500"/></div></section>;
}

function Progress({ label, value, color }: { label: string; value: number; color: string }) { return <div><div className="mb-1 flex justify-between text-sm"><span className="font-semibold text-slate-700">{label}</span><span className="font-bold text-slate-900">{value}%</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }}/></div></div>; }

export function ProjectHome({ project, activities, expenses, resourceUsage, alerts, onNavigate }: { project: any; activities: Activity[]; expenses: DailyExpense[]; resourceUsage: DailyResourceUsage[]; alerts: Array<{ type: string; message: string; severity: string }>; onNavigate: Navigate }) {
  const completed = activities.filter(activity => activity.status === 'completed').length;
  const overall = activities.length ? Math.round((completed / activities.length) * 100) : 0;
  const spent = expenses.filter(expense => expense.status !== 'rejected').reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const committed = storage.getProcurementOrders().filter(order => !['draft', 'cancelled'].includes(order.status)).reduce((sum, order) => sum + Number(order.quantity || 0) * Number(order.unit_rate || 0), 0);
  const waiting = alerts.filter(alert => alert.severity !== 'info').length;
  return <div className="space-y-6"><section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl md:p-8"><p className="text-sm font-bold uppercase tracking-widest text-blue-200">Current project</p><div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><h1 className="text-2xl font-extrabold md:text-3xl">{project.name}</h1><p className="mt-2 text-sm text-slate-300">{project.status || 'Active'} project · focus on what needs attention today.</p></div><div className="rounded-2xl bg-white/10 px-5 py-3 backdrop-blur"><p className="text-xs font-bold uppercase text-blue-100">Overall progress</p><p className="text-3xl font-extrabold">{overall}%</p></div></div></section><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Card icon="👷" title="People" value={String(storage.getEmployees().filter(person => person.status !== 'inactive').length)} note="active team members" onClick={() => onNavigate('people')}/><Card icon="🚜" title="Equipment" value={String(resourceUsage.length)} note="usage records this project" onClick={() => onNavigate('work')}/><Card icon="🛒" title="Procurement" value={String(storage.getProcurementOrders().filter(order => !['delivered','cancelled'].includes(order.status)).length)} note="orders still moving" onClick={() => onNavigate('departments')}/><Card icon="💰" title="Budget" value={money(spent)} note="recorded site spending" onClick={() => onNavigate('departments')}/><Card icon="📋" title="Work" value={`${completed}/${activities.length}`} note="work items completed" onClick={() => onNavigate('work')}/><Card icon="⚠️" title="Attention" value={String(waiting)} note="items waiting for action" onClick={() => onNavigate('notifications')}/></div><div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><ProgressBars activities={activities}/><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between"><div><h3 className="font-bold text-slate-950">Money</h3><p className="text-sm text-slate-500">Current project totals</p></div><button onClick={() => onNavigate('budget')} className="text-sm font-bold text-blue-800">Open money controls</button></div><dl className="mt-5 space-y-3"><Metric label="Contract" value={money(Number(project.contract_amount || 0))}/><Metric label="Committed" value={money(committed)}/><Metric label="Spent" value={money(spent)}/><Metric label="Remaining" value={money(Math.max(0, Number(project.contract_amount || 0) - committed - spent))}/></dl></section></div><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-950">Work requiring attention</h3><p className="text-sm text-slate-500">Clear next steps for this project</p></div><button onClick={() => onNavigate('notifications')} className="text-sm font-bold text-blue-800">View alerts</button></div><div className="mt-4 space-y-2">{alerts.slice(0, 5).map((alert, index) => <div key={`${alert.type}-${index}`} className="flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><span>⚠️</span><span><b>{alert.type}:</b> {alert.message}</span></div>)}{!alerts.length && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">No urgent project actions right now.</p>}</div></section></div>;
}

export function DepartmentHub({ projectId, activities, onNavigate }: { projectId:string; activities:Activity[]; onNavigate: Navigate }) { return <DepartmentsWorkspace projectId={projectId} activities={activities} onNavigate={onNavigate}/>; }

export function WorkHub({ projectId, activities, onNavigate, onRefresh }: { projectId: string; activities: Activity[]; onNavigate: Navigate; onRefresh: () => void | Promise<void> }) { return <WorkBoard items={workItems(projectId, activities, storage.getProcurementOrders())} onNavigate={onNavigate} onRefresh={onRefresh} />; }

export function PeopleHub({ projectId, canManage, onNavigate }: { projectId: string; canManage: boolean; onNavigate: Navigate }) { return <PeopleAssignments projectId={projectId} canManage={canManage} onNavigate={onNavigate} />; }

export function AlertHub({ projectId, onNavigate }: { projectId: string; onNavigate: Navigate }) { return <NotificationCenter projectId={projectId} onNavigate={onNavigate} />; }

function Metric({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0"><dt className="text-slate-500">{label}</dt><dd className="font-bold text-slate-950">{value}</dd></div>; }
