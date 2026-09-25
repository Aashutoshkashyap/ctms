export type BoqRow = { id: string; project_id?: string; wbs_code: string };
export type DependencyRow = { id: string; project_id?: string; predecessor_id: string; successor_id: string; type?: string; lag?: number };
export type SafeBoqImportResult = { ok: true; wbs: BoqRow[]; activities: BoqRow[]; dependencies: DependencyRow[]; created: number; updated: number; unchanged: number } | { ok: false; issues: string[] };

const key = (row: DependencyRow) => `${row.predecessor_id}:${row.successor_id}:${row.type || 'FS'}:${Number(row.lag || 0)}`;

/**
 * Additive import boundary: imported omissions never mean deletion. Existing
 * activity identities and progress fields remain authoritative for historical
 * measurements, valuations, certificates, reports and daily work.
 */
export function mergeBoqSchedule(input: { projectId: string; wbs: BoqRow[]; activities: BoqRow[]; dependencies: DependencyRow[]; existingWbs: BoqRow[]; existingActivities: BoqRow[]; existingDependencies: DependencyRow[] }): SafeBoqImportResult {
  const issues: string[] = [];
  if (!input.projectId) issues.push('A target project is required.');
  const unique = (rows: BoqRow[], label: string) => {
    const seen = new Set<string>();
    rows.forEach(row => { if (!row.id || !row.wbs_code) issues.push(`${label} requires an ID and BOQ item number.`); if (row.project_id && row.project_id !== input.projectId) issues.push(`${label} references another project.`); const value = `${row.id}:${row.wbs_code}`; if (seen.has(value)) issues.push(`Duplicate ${label} row: ${row.wbs_code}.`); seen.add(value); });
  };
  unique(input.wbs, 'WBS'); unique(input.activities, 'Activity');
  if (issues.length) return { ok: false, issues };
  const existingById = new Map(input.existingActivities.map(row => [row.id, row]));
  const existingByCode = new Map<string, BoqRow[]>();
  input.existingActivities.forEach(row => existingByCode.set(row.wbs_code, [...(existingByCode.get(row.wbs_code) || []), row]));
  let created = 0, updated = 0, unchanged = 0;
  const activities = [...input.existingActivities];
  for (const incoming of input.activities) {
    const byId = existingById.get(incoming.id);
    const byCode = existingByCode.get(incoming.wbs_code) || [];
    if (byCode.length > 1) return { ok: false, issues: [`Ambiguous existing BOQ item number: ${incoming.wbs_code}.`] };
    const existing = byId || byCode[0];
    if (!existing) { activities.push({ ...incoming, project_id: input.projectId }); created++; continue; }
    if (byId && existing.wbs_code !== incoming.wbs_code) return { ok: false, issues: [`Existing BOQ item ${existing.id} cannot be renumbered by import.`] };
    const protectedFields = ['id','project_id','actual_quantity','actual_start','actual_finish','status'];
    const next: Record<string, unknown> = { ...existing, ...incoming, id: existing.id, project_id: input.projectId };
    const existingRecord = existing as Record<string, unknown>;
    protectedFields.forEach(field => { if (existingRecord[field] !== undefined) next[field] = existingRecord[field]; });
    const index = activities.findIndex(row => row.id === existing.id);
    if (JSON.stringify(existing) === JSON.stringify(next)) unchanged++; else { activities[index] = next as BoqRow; updated++; }
  }
  const wbs = [...input.existingWbs];
  const wbsByCode = new Map(input.existingWbs.map(row => [row.wbs_code, row]));
  input.wbs.forEach(incoming => { const existing = wbsByCode.get(incoming.wbs_code); if (!existing) wbs.push({ ...incoming, project_id: input.projectId }); else Object.assign(existing, { ...incoming, id: existing.id, project_id: input.projectId }); });
  const validIds = new Set(activities.map(row => row.id));
  const dependencies = [...input.existingDependencies]; const existingKeys = new Set(dependencies.map(key));
  for (const incoming of input.dependencies) { if (!validIds.has(incoming.predecessor_id) || !validIds.has(incoming.successor_id)) return { ok: false, issues: ['A dependency references an activity outside this project.'] }; if (!existingKeys.has(key(incoming))) { dependencies.push({ ...incoming, project_id: input.projectId }); existingKeys.add(key(incoming)); created++; } }
  return { ok: true, wbs, activities, dependencies, created, updated, unchanged };
}
