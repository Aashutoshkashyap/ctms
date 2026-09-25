export type DurableMutationKind = 'daily_work_update' | 'daily_report_delete' | 'project_collection_sync' | 'project_record_delete';

export type DurableMutation = {
  id: string; kind: DurableMutationKind; projectId: string; organizationId: string; actorId: string; targetId: string;
  affectedLocalKeys: string[]; payload: Record<string, unknown>; createdAt: string; updatedAt: string;
  status: 'pending' | 'acknowledged' | 'conflict'; attempts: number; lastError?: string;
  tombstone?: { localKey: string; recordId: string };
};
export type DurableMutationInput = Omit<DurableMutation, 'createdAt' | 'updatedAt' | 'status' | 'attempts'>;
export interface DurableStore { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export const DURABLE_MUTATIONS_KEY = 'bt_durable_mutations';
export const DURABLE_TOMBSTONES_KEY = 'bt_durable_tombstones';

function browserStore(): DurableStore | null { return typeof window === 'undefined' ? null : window.localStorage; }
function read<T>(store: DurableStore | null, key: string, fallback: T): T { try { return store ? JSON.parse(store.getItem(key) || '') as T : fallback; } catch { return fallback; } }
function now() { return new Date().toISOString(); }
export function createMutationId(prefix = 'mut') { return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

/** Local durable ledger; authenticated cloud replay is the acknowledgement authority. */
export class DurableMutationOutbox {
  constructor(private readonly store: DurableStore | null = browserStore()) {}
  all() { return read<DurableMutation[]>(this.store, DURABLE_MUTATIONS_KEY, []); }
  private write(rows: DurableMutation[]) { this.store?.setItem(DURABLE_MUTATIONS_KEY, JSON.stringify(rows)); }
  private tombstones() { return read<Array<{ mutationId: string; projectId: string; localKey: string; recordId: string }>>(this.store, DURABLE_TOMBSTONES_KEY, []); }
  private writeTombstones(rows: Array<{ mutationId: string; projectId: string; localKey: string; recordId: string }>) { this.store?.setItem(DURABLE_TOMBSTONES_KEY, JSON.stringify(rows)); }
  enqueue(input: DurableMutationInput) {
    const existing = this.all().find(row => row.id === input.id); if (existing) return existing;
    const stamp = now(); const mutation: DurableMutation = { ...input, createdAt: stamp, updatedAt: stamp, status: 'pending', attempts: 0 };
    this.write([...this.all(), mutation]);
    if (mutation.tombstone) this.writeTombstones([...this.tombstones(), { mutationId: mutation.id, projectId: mutation.projectId, ...mutation.tombstone }]);
    return mutation;
  }
  pendingForProject(projectId: string, actorId?: string) { return this.all().filter(row => row.status === 'pending' && row.projectId === projectId && (!actorId || row.actorId === actorId)); }
  /**
   * A conflict is not acknowledged. It must protect its local records just
   * like an offline retry until a person resolves it, otherwise a cloud pull
   * could silently replace the locally preserved change.
   */
  unacknowledgedForProject(projectId: string, actorId?: string) {
    return this.all().filter(row => row.projectId === projectId && row.status !== 'acknowledged' && (!actorId || row.actorId === actorId));
  }
  protectedLocalKeys(projectId: string) { return new Set(this.unacknowledgedForProject(projectId).flatMap(row => row.affectedLocalKeys)); }
  summaryForProject(projectId: string, actorId?: string) {
    const rows = this.unacknowledgedForProject(projectId, actorId);
    return {
      pending: rows.filter(row => row.status === 'pending').length,
      conflicts: rows.filter(row => row.status === 'conflict').length,
      lastError: rows.find(row => row.lastError)?.lastError,
    };
  }
  markFailed(id: string, error: string) { const stamp = now(); this.write(this.all().map(row => row.id === id ? { ...row, status: 'pending' as const, attempts: row.attempts + 1, lastError: error, updatedAt: stamp } : row)); }
  markConflict(id: string, error: string) { const stamp = now(); this.write(this.all().map(row => row.id === id ? { ...row, status: 'conflict' as const, lastError: error, updatedAt: stamp } : row)); }
  acknowledge(id: string) { const stamp = now(); this.write(this.all().map(row => row.id === id ? { ...row, status: 'acknowledged' as const, lastError: undefined, updatedAt: stamp } : row)); this.writeTombstones(this.tombstones().filter(row => row.mutationId !== id)); }
  hasTombstone(projectId: string, localKey: string, recordId: string) { return this.tombstones().some(row => row.projectId === projectId && row.localKey === localKey && row.recordId === recordId); }
}
