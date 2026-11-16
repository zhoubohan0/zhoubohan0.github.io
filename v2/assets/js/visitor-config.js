// Public endpoints on the verified Workers Free account. No credentials or seeded counts.
export const visitorConfig = Object.freeze({
  endpoint: 'https://bohan-visitor-map.3459783348.workers.dev/stats',
  trackEndpoint: 'https://bohan-visitor-map.3459783348.workers.dev/visit',
  allowedHosts: ['zhoubohan0.github.io'],
  mirrorEndpoint: '',
  fallbackSnapshot: undefined,
  refreshInterval: 60000,
  maximumSnapshotAge: 7200000,
  syncPaused: false,
  publicDashboard: '',
});
