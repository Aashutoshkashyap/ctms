import type { Activity } from '../lib/cpm';
import type { DailyExpense, DailyResourceUsage, EmployeeVisit } from '../lib/storage';
import { storage } from '../lib/storage';
import { MetricCard, SectionHeader } from './ManagementUI';

type Snapshot = { label: string; value: string; note: string; icon: string; tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate' };
const amount = (value: number) => `NPR ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;

export default function ModuleSnapshot({ moduleId, projectName, contractAmount, activities, expenses, resourceUsage, employeeVisits, peopleCount, ipcCount, qaqcCount, safetyCount, defectsCount, today, canSeeFinancialSummary }: {
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
    'quality-safety': { description: 'Inspection, quality and safety records for the current project.', metrics: [
      { label: 'Quality records', value: String(qaqcCount), note: 'Inspections and checks', icon: '✓' },
      { label: 'Safety records', value: String(safetyCount), note: 'Site safety entries', icon: '🦺', tone: 'amber' },
      { label: 'Defects', value: String(defectsCount), note: 'Recorded defects', icon: '!', tone: 'red' },
    ] },
    'document-vault': { description: 'Find project files, controlled documents and photographic evidence.', metrics: [
      { label: 'Registered documents', value: String(documents.length), note: 'Current project register', icon: '📁' },
      { label: 'In review', value: String(documents.filter(item => item.status === 'under_review').length), note: 'Awaiting document decision', icon: '👁', tone: 'amber' },
      { label: 'Uploads', value: String(uploadedCount), note: 'Current project file references', icon: '↥', tone: 'slate' },
    ] },
  };
  const summary = summaries[moduleId];
  if (!summary) return null;
  return <section aria-label={`${moduleId} summary`} className="mb-6 space-y-3"><SectionHeader title={`${projectName} · at a glance`} description={summary.description} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{summary.metrics.map(metric => <MetricCard key={metric.label} {...metric} />)}</div></section>;
}
