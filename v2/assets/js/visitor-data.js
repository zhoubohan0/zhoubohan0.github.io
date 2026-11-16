// Public, aggregate country snapshots only. Never reload the tracking image.
export function createVisitorDataSource({ endpoint, normalize, onData, onState,
  fetcher = fetch, storage, initialPayload, now = Date.now, minimumInterval = 15000, cacheBucket = 30000,
  fallbackEndpoints = [], maximumAge = Infinity }) {
  const key = `bohan-visitor-snapshot:${endpoint}`;
  let disposed = false, pending, controller, lastAttempt = -Infinity;
  let current, currentData, currentTimestamp = -Infinity, signature = '';

  function accept(payload, cached = false) {
    const data = normalize(payload);
    const timestamp = typeof payload.updatedAt === 'string' ? Date.parse(payload.updatedAt) : NaN;
    if (!Number.isFinite(timestamp)) throw new Error('Invalid visitor snapshot timestamp');
    // A legacy cached/deployed response must not collapse the two providers'
    // different measurements back into a misleading combined visitor count.
    if (current?.migration && !data.migration) throw new Error('Visitor migration metadata missing');
    // An older CDN response must not replace a newer snapshot from this session.
    if (current && timestamp < currentTimestamp) return false;
    if (currentData?.migration && data.migration?.provider === currentData.migration.provider &&
        data.migration.trackingStartedAt === currentData.migration.trackingStartedAt) {
      const previous = currentData.migration;
      if (data.migration.historicalVisitors !== previous.historicalVisitors ||
          data.migration.historicalUpdatedAt !== previous.historicalUpdatedAt ||
          data.migration.currentVisits < previous.currentVisits ||
          data.migration.unknownCurrentVisits < previous.unknownCurrentVisits ||
          data.migration.unlocatedCurrentVisits < previous.unlocatedCurrentVisits) throw new Error('Visitor totals decreased');
      const check = (before, after, key) => {
        const next = new Map(after.map(entry => [key(entry), entry]));
        for (const entry of before) {
          const value = next.get(key(entry));
          if (!value || value.historicalVisitors !== entry.historicalVisitors || value.currentVisits < entry.currentVisits) {
            throw new Error('Visitor location totals decreased');
          }
        }
      };
      check(currentData.countries || currentData.markers, data.countries || data.markers, entry => entry.country);
      check(currentData.markers, data.markers, entry => entry.id || entry.country);
    }
    const nextSignature = JSON.stringify(data);
    const changed = nextSignature !== signature;
    current = payload;
    currentData = data;
    currentTimestamp = timestamp;
    signature = nextSignature;
    onData(data, payload, { changed, cached });
    return true;
  }

  // Ship a verified snapshot with the page's configuration so a first-visit
  // timeout does not erase the map. Preserve its original collection time.
  try { if (initialPayload) accept(initialPayload, true); } catch { /* Never display an invalid fallback. */ }
  try {
    const saved = JSON.parse(storage?.getItem(key) || 'null');
    if (saved && now() >= saved.savedAt && now() - saved.savedAt < 86400000) accept(saved.payload, true);
  } catch { /* Storage can be disabled or contain an obsolete snapshot. */ }

  function refresh() {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    if (now() - lastAttempt < minimumInterval) return Promise.resolve();
    lastAttempt = now();
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 10000);
    onState(current ? 'refreshing' : 'loading', current);
    pending = Promise.resolve().then(async () => {
      try {
        // Pages' CDN can hold a JSON URL for ten minutes. A shared 30-second
        // bucket discovers newly deployed snapshots without a unique cache key
        // for every visitor, while the session cache still paints immediately.
        // Read the same-origin mirror concurrently: a blocked workers.dev DNS
        // lookup must not delay a usable map by the network timeout.
        const replies = await Promise.allSettled([...new Set([endpoint, ...fallbackEndpoints])].map(async address => {
          const requestURL = new URL(address);
          requestURL.searchParams.set('snapshot', String(Math.floor(now() / Math.max(30000, cacheBucket))));
          const response = await fetcher(requestURL.href, {
            credentials: 'omit', cache: 'no-cache', signal: controller.signal,
          });
          if (!response.ok) throw new Error('Visitor statistics unavailable');
          const payload = await response.json();
          if (disposed) return;
          if (accept(payload)) {
            try { storage?.setItem(key, JSON.stringify({ savedAt: now(), payload })); } catch { /* Optional cache. */ }
          }
          // Paint a healthy mirror immediately, even if the direct request is
          // still waiting. Always keep the source's actual timestamp.
          if (now() - currentTimestamp <= maximumAge) onState('connected', current);
        }));
        if (disposed) return;
        if (!replies.some(reply => reply.status === 'fulfilled') || now() - currentTimestamp > maximumAge) {
          onState(current ? 'stale' : 'unavailable', current);
        }
      } catch {
        if (!disposed) onState(current ? 'stale' : 'unavailable', current);
      } finally {
        clearTimeout(timeout);
        pending = undefined;
        controller = undefined;
      }
    });
    return pending;
  }

  return { refresh, dispose() { disposed = true; controller?.abort(); } };
}
