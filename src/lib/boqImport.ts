import type { Activity, Dependency } from './cpm';
import type { WbsItem } from './storage';

export type BoqImportIssue = { code: string; entity: 'wbs' | 'activity' | 'dependency'; id?: string; message: string };
export type BoqImportCounts = { created: number; updated: number; unchanged: number; conflicted: number; rejected: number };
export type BoqImportResult = {
  ok: boolean;
  counts: BoqImportCounts;
  issues: BoqImportIssue[];
  wbs: WbsItem[];
  activities: Activity[];
  dependencies: Dependency[];
};

type ScheduleSnapshot = { wbs: WbsItem[]; activities: Activity[]; dependencies: Dependency[] };
type ScheduleImport = ScheduleSnapshot & { projectId: string };

const emptyCounts = (): BoqImportCounts => ({ created: 0, updated: 0, unchanged: 0, conflicted: 0, rejected: 0 });
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const activityKey = (activity: Pick<Activity, 'wbs_code' | 'name'>) => `${normalized(activity.wbs_code)}|${normalized(activity.name)}`;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function reject(counts: BoqImportCounts, issues: BoqImportIssue[], entity: BoqImportIssue['entity'], message: string, id?: string) {
  counts.rejected += 1;
  issues.push({ code: 'INVALID_IMPORT', entity, id, message });
}
function conflict(counts: BoqImportCounts, issues: BoqImportIssue[], entity: BoqImportIssue['entity'], message: string, id?: string) {
  counts.conflicted += 1;
  issues.push({ code: 'MATCH_CONFLICT', entity, id, message });
}

/**
 * Pure, validate-first BOQ schedule merge. It intentionally has no delete
 * path: rows absent from an import remain untouched. The caller persists the
 * returned plan only when `ok` is true.
 */
export function prepareSafeBoqImport(existing: ScheduleSnapshot, incoming: ScheduleImport): BoqImportResult {
  const counts = emptyCounts();
  const issues: BoqImportIssue[] = [];
  const projectId = incoming.projectId.trim();
  if (!projectId) reject(counts, issues, 'activity', 'A target project is required.');

  const projectMismatch = (row: { project_id?: string }, entity: BoqImportIssue['entity'], id?: string) => {
    if (row.project_id && row.project_id !== projectId) reject(counts, issues, entity, 'Imported data references a different project.', id);
  };
  incoming.wbs.forEach(item => {
    projectMismatch(item, 'wbs', item.id);
    if (!item.wbs_code?.trim() || !item.name?.trim()) reject(counts, issues, 'wbs', 'Each WBS item needs a BOQ code and name.', item.id);
  });
  incoming.activities.forEach(item => {
    projectMismatch(item as Activity & { project_id?: string }, 'activity', item.id);
    if (!item.id?.trim() || !item.wbs_code?.trim() || !item.name?.trim() || !item.baseline_start || !item.baseline_finish || !Number.isFinite(item.planned_duration) || item.planned_duration < 1) {
      reject(counts, issues, 'activity', 'Each activity needs an ID, BOQ code, description, dates, and a positive duration.', item.id);
    }
  });
  incoming.dependencies.forEach(item => {
    projectMismatch(item as Dependency & { project_id?: string }, 'dependency', item.id);
    if (!item.id?.trim() || !item.predecessor_id || !item.successor_id || item.predecessor_id === item.successor_id || !['FS', 'SS', 'FF', 'SF'].includes(item.type)) {
      reject(counts, issues, 'dependency', 'Each predecessor link must have two different activities and a valid relationship type.', item.id);
    }
  });

  const duplicate = <T extends { id: string }>(rows: T[], entity: BoqImportIssue['entity']) => {
    const seen = new Set<string>();
    rows.forEach(row => {
      if (seen.has(row.id)) conflict(counts, issues, entity, 'The import contains the same stable ID more than once.', row.id);
      seen.add(row.id);
    });
  };
  duplicate(incoming.wbs, 'wbs');
  duplicate(incoming.activities, 'activity');
  duplicate(incoming.dependencies, 'dependency');
  const incomingActivityKeys = new Set<string>();
  incoming.activities.forEach(activity => {
    const key = activityKey(activity);
    if (incomingActivityKeys.has(key)) conflict(counts, issues, 'activity', 'The import contains ambiguous duplicate BOQ work.', activity.id);
    incomingActivityKeys.add(key);
  });
  if (issues.length) return { ok: false, counts, issues, ...existing };

  const nextWbs = [...existing.wbs];
  const wbsByCode = new Map(existing.wbs.map(item => [item.wbs_code, item]));
  for (const item of incoming.wbs) {
    const prior = wbsByCode.get(item.wbs_code);
    if (!prior) { nextWbs.push({ ...item, project_id: projectId }); counts.created += 1; continue; }
    const candidate = { ...prior, name: item.name, parent_code: item.parent_code ?? null, project_id: projectId };
    if (same(prior, candidate)) counts.unchanged += 1;
    else { nextWbs[nextWbs.indexOf(prior)] = candidate; counts.updated += 1; }
  }

  const nextActivities = [...existing.activities];
  const byId = new Map(existing.activities.map(item => [item.id, item]));
  const byFingerprint = new Map<string, Activity[]>();
  existing.activities.forEach(item => {
    const key = activityKey(item); byFingerprint.set(key, [...(byFingerprint.get(key) || []), item]);
  });
  const resolvedActivityIds = new Map<string, string>();
  for (const item of incoming.activities) {
    const byStableId = byId.get(item.id);
    const matches = byFingerprint.get(activityKey(item)) || [];
    if (byStableId && matches.length && !matches.some(match => match.id === byStableId.id)) {
      conflict(counts, issues, 'activity', 'The stable ID and BOQ/description identify different existing work items.', item.id);
      continue;
    }
    if (!byStableId && matches.length > 1) { conflict(counts, issues, 'activity', 'More than one existing activity has this BOQ code and description.', item.id); continue; }
    const prior = byStableId || matches[0];
    if (!prior) {
      nextActivities.push({ ...item, project_id: projectId } as Activity);
      resolvedActivityIds.set(item.id, item.id); counts.created += 1; continue;
    }
    // Progress is operational history, not an import field. Preserve it while
    // allowing an authorized schedule import to update planned attributes.
    const candidate = { ...prior, ...item, id: prior.id, project_id: projectId, actual_quantity: prior.actual_quantity, actual_start: prior.actual_start, actual_finish: prior.actual_finish, status: prior.status } as Activity;
    resolvedActivityIds.set(item.id, prior.id);
    if (same(prior, candidate)) counts.unchanged += 1;
    else { nextActivities[nextActivities.indexOf(prior)] = candidate; counts.updated += 1; }
  }
  if (issues.length) return { ok: false, counts, issues, ...existing };

  const nextDependencies = [...existing.dependencies];
  const existingDependencies = new Map(existing.dependencies.map(item => [item.id, item]));
  const dependencyFingerprint = (item: Dependency) => `${item.predecessor_id}|${item.successor_id}|${item.type}|${item.lag || 0}`;
  const dependencyByFingerprint = new Map(existing.dependencies.map(item => [dependencyFingerprint(item), item]));
  const knownActivityIds = new Set(nextActivities.map(item => item.id));
  for (const item of incoming.dependencies) {
    const predecessorId = resolvedActivityIds.get(item.predecessor_id) || item.predecessor_id;
    const successorId = resolvedActivityIds.get(item.successor_id) || item.successor_id;
    if (!knownActivityIds.has(predecessorId) || !knownActivityIds.has(successorId)) { conflict(counts, issues, 'dependency', 'A predecessor link references an unknown or conflicted activity.', item.id); continue; }
    const candidate = { ...item, predecessor_id: predecessorId, successor_id: successorId, project_id: projectId } as Dependency;
    const byStableId = existingDependencies.get(item.id);
    const byMeaning = dependencyByFingerprint.get(dependencyFingerprint(candidate));
    if (byStableId && byMeaning && byStableId.id !== byMeaning.id) { conflict(counts, issues, 'dependency', 'The stable ID and predecessor link identify different existing records.', item.id); continue; }
    const prior = byStableId || byMeaning;
    if (!prior) { nextDependencies.push(candidate); counts.created += 1; continue; }
    if (same(prior, { ...candidate, id: prior.id })) counts.unchanged += 1;
    else { nextDependencies[nextDependencies.indexOf(prior)] = { ...candidate, id: prior.id }; counts.updated += 1; }
  }
  if (issues.length) return { ok: false, counts, issues, ...existing };
  return { ok: true, counts, issues, wbs: nextWbs, activities: nextActivities, dependencies: nextDependencies };
}
