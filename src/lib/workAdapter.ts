import type { Activity } from './cpm';
import type { ProcurementOrder } from './storage';

export type WorkStage = 'new' | 'in_progress' | 'waiting' | 'completed';
export type WorkItem = { id: string; source: 'activity' | 'procurement'; title: string; type: string; actualStatus: string; stage: WorkStage; dueDate?: string; assignee?: string; description?: string; overdue: boolean; projectId: string };
const mapActivity: Record<Activity['status'], WorkStage> = { not_started: 'new', in_progress: 'in_progress', completed: 'completed' };
const mapProcurement: Record<ProcurementOrder['status'], WorkStage> = { draft: 'new', approved: 'in_progress', ordered: 'in_progress', partially_delivered: 'waiting', delivered: 'completed', cancelled: 'completed' };
export function workItems(projectId: string, activities: Activity[], orders: ProcurementOrder[], today = new Date().toISOString().slice(0, 10)): WorkItem[] {
  return [...activities.map(item => ({ id: `activity:${item.id}`, source: 'activity' as const, title: item.name, type: 'Site Work', actualStatus: item.status.replaceAll('_', ' '), stage: mapActivity[item.status], dueDate: item.baseline_finish, description: item.wbs_code, overdue: item.status !== 'completed' && item.baseline_finish < today, projectId })), ...orders.map(item => ({ id: `procurement:${item.id}`, source: 'procurement' as const, title: item.item, type: 'Procurement', actualStatus: item.status.replaceAll('_', ' '), stage: mapProcurement[item.status], dueDate: item.expected_date || item.required_date, assignee: undefined, description: `${item.po_number} · ${item.vendor}`, overdue: !['delivered', 'cancelled'].includes(item.status) && (item.expected_date || item.required_date) < today, projectId }))];
}
