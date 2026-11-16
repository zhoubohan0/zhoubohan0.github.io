// One anonymous page-visit event per document. No cookies or persistent visitor ID.
let started = false;

export function shouldTrackVisit(config, location, navigator) {
  return Boolean(config.trackEndpoint && config.allowedHosts?.includes(location.hostname) &&
    /^\/(?:index\.html|publications\/(?:index\.html)?|v2\/(?:index\.html|publications\/(?:index\.html)?)?)?$/.test(location.pathname) &&
    navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true);
}

export function initVisitTracking(config) {
  if (started || !shouldTrackVisit(config, window.location, window.navigator)) return;
  let endpoint;
  try {
    endpoint = new URL(config.trackEndpoint);
    const stats = new URL(config.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.origin !== stats.origin || endpoint.pathname !== '/visit') return;
  } catch { return; }
  started = true;
  const send = () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      fetch(endpoint.href, {
        method: 'POST', credentials: 'omit', mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: crypto.randomUUID() }),
        referrerPolicy: 'no-referrer', keepalive: true, signal: controller.signal,
      }).catch(() => {}).finally(() => clearTimeout(timeout));
    } catch { clearTimeout(timeout); }
  };
  if (document.hidden) {
    const onVisible = () => {
      if (!document.hidden) { document.removeEventListener('visibilitychange', onVisible); send(); }
    };
    document.addEventListener('visibilitychange', onVisible);
  } else send();
}
