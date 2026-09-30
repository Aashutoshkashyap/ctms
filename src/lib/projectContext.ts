/** Small, framework-free helpers for the single active-project boundary. */
export function projectIdFromUrl(search: string): string | null {
  const value = new URLSearchParams(search).get('project');
  return value?.trim() || null;
}

export function workspaceUrl(current: string, projectId: string, tab?: string) {
  const url = new URL(current);
  url.searchParams.set('project', projectId);
  if (tab && tab !== 'dashboard') url.searchParams.set('tab', tab);
  else url.searchParams.delete('tab');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Prevent an older async refresh from committing state after a later switch. */
export function isCurrentProject(expectedProjectId: string, activeProjectId: string) {
  return Boolean(expectedProjectId) && expectedProjectId === activeProjectId;
}
