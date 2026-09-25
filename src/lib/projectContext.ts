export function projectIdFromUrl(search: string): string | null { const value = new URLSearchParams(search).get('project'); return value?.trim() || null; }
export function workspaceUrl(current: string, projectId: string) { const url = new URL(current); url.searchParams.set('project', projectId); url.searchParams.delete('tab'); return `${url.pathname}${url.search}${url.hash}`; }
export function isCurrentProject(expectedProjectId: string, activeProjectId: string) { return Boolean(expectedProjectId) && expectedProjectId === activeProjectId; }
