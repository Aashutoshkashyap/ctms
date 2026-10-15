import { storage } from './storage';
import { createMutationId } from './durableMutationOutbox';

export type DailyWorkUpdateInput = {
  projectId: string;
  report: Record<string, unknown>;
  workItems: Array<Record<string, unknown>>;
  materialItems: Array<Record<string, unknown>>;
  operationId?: string;
};

/**
 * Canonical application boundary for field work. Web/mobile uses this today;
 * a future WhatsApp/OpenWA or other channel adapter must translate its input
 * into this command, never create a parallel message or field-record model.
 */
export async function saveDailyWorkUpdate(input: DailyWorkUpdateInput) {
  const activeProject = storage.getProject();
  if (!input.projectId || input.projectId !== activeProject.id) throw new Error('The selected project is no longer active. Refresh and try again.');
  const activityIds = new Set(storage.getActivities().map(activity => activity.id));
  if (input.workItems.some(item => !activityIds.has(String(item.activity_id || '')))) throw new Error('Choose a work item from this project.');
  const reportId = String(input.report.id || `rep-${Date.now()}`);
  const operationId = input.operationId || `daily-work-${input.projectId}-${reportId}-${createMutationId('op')}`;
  const reportInput = { ...input.report, id: reportId };
  // This id is generated once per user save and persisted in the outbox. A
  // retry replays this exact operation; a later edit gets a new operation.
  storage.enqueueDailyWorkMutation({ projectId: input.projectId, report: reportInput, workItems: input.workItems, materialItems: input.materialItems, operationId });
  const report = storage.submitDailyReport(reportInput, input.workItems, input.materialItems);
  const sync = await storage.flushDurableMutations(input.projectId);
  // Local demo workspaces deliberately have no cloud target. A connected
  // workspace, including a temporarily offline one, must still surface the
  // pending/failed state rather than falsely claiming cloud confirmation.
  if (!sync.ok && storage.isSupabaseConfigured()) throw new Error(sync.message || 'The update could not be saved to the project database. Please retry.');
  return report;
}
