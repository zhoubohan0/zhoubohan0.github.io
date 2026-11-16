// Configure only your own aggregate statistics endpoint when it becomes available.
// Empty means a fully interactive globe with no counts, markers or tracking requests.
export const visitorConfig = Object.freeze({
  endpoint: '',
  mirrorEndpoint: '',
  fallbackSnapshot: undefined,
  refreshInterval: 900000,
  maximumSnapshotAge: 7200000,
  syncPaused: false,
  publicDashboard: '',
});
