const ALLOWED_ORIGIN = 'https://zhoubohan0.github.io';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });
}
export function approximateLocation(cf = {}) {
  if (typeof cf.country !== 'string' || !/^[A-Z]{2}$/.test(cf.country) || cf.country === 'XX') return null;
  const coordinate = (value, limit) => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 10) / 10 : null;
  };
  const latitude = coordinate(cf.latitude, 90), longitude = coordinate(cf.longitude, 180);
  if (latitude === null || longitude === null) return null;
  const city = typeof cf.city === 'string' ? cf.city.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 96) : '';
  return { country: cf.country, city, latitude, longitude, key: JSON.stringify([cf.country, city, latitude, longitude]) };
}

export async function handleRequest(request, env, ctx = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, service: 'bohan-visitor-map', metric: 'page-visits' });
  if (url.pathname === '/visit') {
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return json({ error: 'Origin not allowed' }, 403);
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
    if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return json({ counted: false, reason: 'privacy-preference' }, 200, cors);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415, cors);
    if (Number(request.headers.get('Content-Length') || 0) > 512) return json({ error: 'Request too large' }, 413, cors);
    let data;
    try {
      const body = await request.text();
      if (body.length > 512) return json({ error: 'Request too large' }, 413, cors);
      data = JSON.parse(body);
    } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
    if (!data || !UUID.test(data.eventId || '') || Object.keys(data).some(key => !['eventId', 'dryRun'].includes(key)) || (data.dryRun !== undefined && typeof data.dryRun !== 'boolean')) return json({ error: 'Invalid event' }, 400, cors);
    const place = approximateLocation(request.cf);
    // A live connectivity/geolocation test can explicitly avoid polluting counts.
    if (data.dryRun) return json({ counted: false, dryRun: true, locationAvailable: Boolean(place) }, 200, cors);
    const now = new Date(), day = now.toISOString().slice(0, 10);
    try {
      const quota = await env.DB.prepare('SELECT visits FROM visitor_days WHERE day = ?').bind(day).first();
      if ((quota?.visits || 0) >= 5000) return json({ counted: false, reason: 'daily-limit' }, 429, { ...cors, 'Retry-After': '3600' });
      const accepted = await env.DB.prepare(`INSERT OR IGNORE INTO visitor_events
        (event_id, created_at, day, country, city, latitude, longitude, location_key, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING event_id`).bind(
          data.eventId, now.getTime(), day, place?.country ?? null, place?.city ?? null,
          place?.latitude ?? null, place?.longitude ?? null, place?.key ?? null, now.toISOString()
        ).first();
      if (accepted) {
        const cleanup = env.DB.prepare(`DELETE FROM visitor_events WHERE event_id IN
          (SELECT event_id FROM visitor_events WHERE created_at < ? ORDER BY created_at LIMIT 25)`)
          .bind(now.getTime() - 7 * 86400000).run().catch(() => {});
        if (ctx.waitUntil) ctx.waitUntil(cleanup); else await cleanup;
      }
      return json({ counted: Boolean(accepted) }, 202, cors);
    } catch { return json({ counted: false, error: 'Statistics temporarily unavailable' }, 503, cors); }
  }
  if (url.pathname === '/stats' && request.method === 'GET') {
    const cache = globalThis.caches?.default;
    const key = new Request(url.origin + '/stats');
    const cached = await cache?.match(key);
    if (cached) return cached;
    try {
      const [totals, places] = await env.DB.batch([
        env.DB.prepare('SELECT visits, last_visit_at FROM visitor_totals WHERE id = 1'),
        env.DB.prepare('SELECT country, city, latitude, longitude, visits FROM visitor_places ORDER BY visits DESC LIMIT 500'),
      ]);
      const value = totals.results[0] || { visits: 0, last_visit_at: null };
      const markers = places.results.map(row => ({ country: row.country, city: row.city, location: [row.latitude, row.longitude], visitors: row.visits }));
      const response = json({ totalVisitors: value.visits, updatedAt: new Date().toISOString(), lastVisitAt: value.last_visit_at, markers, metric: 'page-visits', unlocatedOrUnlistedVisits: value.visits - markers.reduce((sum, marker) => sum + marker.visitors, 0) }, 200, { 'Cache-Control': 'public, max-age=60' });
      if (cache && ctx.waitUntil) ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    } catch { return json({ error: 'Statistics temporarily unavailable' }, 503); }
  }
  return json({ error: 'Not found' }, 404);
}

export default { fetch: handleRequest };
