/** Small, dependency-free policies used by the client shell. */
export function needsPortfolioCollections(role?: string) {
  return role === 'project_director';
}

export function mayRefreshWorkspace(options: { online: boolean; visible: boolean; activeTab: string }) {
  return options.online && options.visible && options.activeTab !== 'daily';
}
