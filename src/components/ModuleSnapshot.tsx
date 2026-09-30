import type { Activity } from '../lib/cpm';
import type { DailyExpense, DailyResourceUsage, EmployeeVisit } from '../lib/storage';
import { storage } from '../lib/storage';
import { MetricCard, SectionHeader } from './ManagementUI';

type Snapshot = { label: string; value: string; note: string; icon: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate' };
const amount = (value: number) => `NPR ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;

export default function ModuleSnapshot({ moduleId, projectName, contractAmount, activities, expenses, resourceUsage, employeeVisits, peopleCount, ipcCount, qaqcCount, safetyCount, defectsCount, pendingInspections, failedInspections, safetyIncidents, today, canSeeFinancialSummary }: {
  moduleId: string;
  projectName: string;
  contractAmount: number;
  activities: Activity[];
  expenses: DailyExpense[];
  resourceUsage: DailyResourceUsage[];
  employeeVisits: EmployeeVisit[];
  peopleCount: number;
  ipcCount: number;
  qaqcCount: number;
  safetyCount: number;
  defectsCount: number;
  pendingInspections: number;
  failedInspections: number;
  safetyIncidents: number;
  today: string;
  canSeeFinancialSummary: boolean;
}) {
  if (!['people', 'work', 'fleet', 'commercial', 'quality-safety', 'document-vault'].includes(moduleId) || (moduleId === 'commercial' && !canSeeFinancialSummary)) return null;
  const openWork = activities.filter(item => item.status !== 'completed');
  const documents = moduleId === 'document-vault' ? storage.getDocuments() : [];
  const uploadedCount = moduleId === 'document-vault' ? storage.getUploadedDocuments().length : 0;
  const expensesLogged = expenses.filter(item => item.status !== 'rejected').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const summaries: Record<string, { description: string; metrics: Snapshot[] }> = {
    people: { description: 'People assigned to this project and today’s workforce movement.', metrics: [
      { label: 'Project people', value: String(peopleCount), note: 'Current project users', icon: '👥' },
      { label: 'On site', value: String(employeeVisits.filter(item => item.status === 'on_site').length), note: 'Recorded site visits', icon: '📍', tone: 'green' },
      { label: 'Planned visits', value: String(employeeVisits.filter(item => item.status === 'planned').length), note: 'Not yet checked in', icon: '🗓️', tone: 'slate' },
    ] },
    work: { description: 'Work items and schedule risks for this project.', metrics: [
      { label: 'Needs doing', value: String(openWork.length), note: 'Not marked complete', icon: '📋' },
      { label: 'Overdue', value: String(openWork.filter(item => item.baseline_finish && item.baseline_finish < today).length), note: 'Past planned finish', icon: '!', tone: 'amber' },
      { label: 'Completed', value: String(activities.length - openWork.length), note: 'Work items finished', icon: '✓', tone: 'green' },
    ] },
    fleet: { description: 'Equipment activity recorded on the current project.', metrics: [
      { label: 'Usage logs', value: String(resourceUsage.length), note: 'Daily equipment entries', icon: '🚜' },
      { label: 'Hours logged', value: resourceUsage.reduce((sum, item) => sum + Number(item.equipment_hours || 0), 0).toLocaleString(), note: 'Equipment operating hours', icon: '⏱', tone: 'green' },
      { label: 'Downtime', value: resourceUsage.reduce((sum, item) => sum + Number(item.downtime_hours || 0), 0).toLocaleString(), note: 'Hours reported', icon: '!', tone: 'amber' },
    ] },
    commercial: { description: 'Different financial stages stay separate: contract, costs and IPC records.', metrics: [
      { label: 'Contract value', value: amount(Number(contractAmount || 0)), note: 'Original project value', icon: '₨' },
      { label: 'Expenses logged', value: amount(expensesLogged), note: 'Not certified or paid amount', icon: '↗', tone: 'slate' },
      { label: 'IPC records', value: String(ipcCount), note: 'See valuation for status and amounts', icon: '🧾' },
    ] },
    'quality-safety': { description: `${qaqcCount} inspections and ${safetyCount} safety logs for this project.`, metrics: [
      { label: 'Waiting inspection', value: String(pendingInspections), note: 'Requests not yet resolved', icon: '◷', tone: 'amber' },
      { label: 'Failed / NCR', value: String(failedInspections), note: 'Inspection failures recorded', icon: '!', tone: 'red' },
      { label: 'Safety incidents', value: String(safetyIncidents), note: 'Incidents in logged events', icon: '🦺', tone: 'red' },
      { label: 'Defects', value: String(defectsCount), note: 'Recorded defects', icon: '!', tone: 'amber' },
    ] },
    'document-vault': { description: 'Find project files, controlled documents and photographic evidence.', metrics: [
      { label: 'Registered documents', value: String(documents.length), note: 'Current project register', icon: '📁' },
      { label: 'In review', value: String(documents.filter(item => item.status === 'under_review').length), note: 'Awaiting document decision', icon: '👁', tone: 'amber' },
      { label: 'Uploads', value: String(uploadedCount), note: 'Current project file references', icon: '↥', tone: 'slate' },
    ] },
  };
  const summary = summaries[moduleId];
  if (!summary) return null;
  return <section aria-label={`${moduleId} summary`} className="mb-6 space-y-3"><SectionHeader title={`${projectName} · at a glance`} description={summary.description} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.metrics.map(metric => <MetricCard key={metric.label} {...metric} />)}</div>{moduleId === 'commercial' && <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-900">Commercial path</p><ol className="mt-3 flex flex-wrap gap-2 text-sm text-slate-700">{['BOQ', 'Measured work', 'Valuation', 'Certificate', 'Payment status'].map((stage, index) => <li key={stage} className="flex items-center gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-900">{stage}</span>{index < 4 && <span aria-hidden="true" className="text-slate-400">→</span>}</li>)}</ol><p className="mt-2 text-xs text-slate-500">Each stage follows its existing project record and approval workflow.</p></div>}</section>;
}
