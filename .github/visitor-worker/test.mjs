import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { approximateLocation, handleRequest } from './worker.mjs';
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(schema);
  const wrap = (query, args = []) => ({
    bind: (...values) => wrap(query, values),
    first: async () => sql.prepare(query).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    run: async () => sql.prepare(query).run(...args),
  });
  return { sql, env: { DB: { prepare: query => wrap(query), batch: async statements => Promise.all(statements.map(s => s.all())) } } };
}
function visit(eventId = randomUUID(), extra = {}) {
  const request = new Request('https://example.workers.dev/visit', { method: 'POST', headers: { Origin: 'https://zhoubohan0.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, ...extra }) });
  Object.defineProperty(request, 'cf', { value: { country: 'HK', city: 'Hong Kong', latitude: '22.3193', longitude: '114.1694' } });
  return request;
}
test('duplicate requests count once; GET never adds visits', async () => {
  const { sql, env } = fixture(); const id = randomUUID();
  assert.equal((await handleRequest(visit(id), env)).status, 202);
  assert.deepEqual(await (await handleRequest(visit(id), env)).json(), { counted: false });
  const get = () => handleRequest(new Request('https://example.workers.dev/stats'), env);
  const result = await (await get()).json(); await get();
  assert.equal(result.totalVisitors, 1); assert.equal(result.markers[0].visitors, 1);
  assert.deepEqual(result.markers[0].location, [22.3, 114.2]);
  assert.equal(sql.prepare('SELECT visits FROM visitor_totals').get().visits, 1); sql.close();
});
test('local origins and dry runs cannot change production counts', async () => {
  const { sql, env } = fixture();
  const local = new Request('https://example.workers.dev/visit', { method: 'POST', headers: { Origin: 'http://127.0.0.1:59766' } });
  assert.equal((await handleRequest(local, env)).status, 403);
  assert.equal((await (await handleRequest(visit(randomUUID(), { dryRun: true }), env)).json()).counted, false);
  assert.equal(sql.prepare('SELECT visits FROM visitor_totals').get().visits, 0); sql.close();
});
test('unknown geolocation contributes to total without an invented marker', async () => {
  const { sql, env } = fixture(); const request = new Request(visit());
  await handleRequest(request, env);
  const value = await (await handleRequest(new Request('https://example.workers.dev/stats'), env)).json();
  assert.equal(value.totalVisitors, 1); assert.deepEqual(value.markers, []);
  assert.equal(value.unlocatedOrUnlistedVisits, 1); sql.close();
});
test('application daily cap is enforced by handler and database trigger', async () => {
  const { sql, env } = fixture(); const day = new Date().toISOString().slice(0, 10);
  sql.prepare('INSERT INTO visitor_days(day, visits) VALUES (?,5000)').run(day);
  assert.equal((await handleRequest(visit(), env)).status, 429);
  sql.prepare('INSERT INTO visitor_events(event_id,created_at,day,observed_at) VALUES (?,?,?,?)').run(randomUUID(), Date.now(), day, new Date().toISOString());
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM visitor_events').get().count, 0); sql.close();
});
test('quota/database errors fail closed without retry or a fake count', async () => {
  const env = { DB: { prepare() { throw Error('free quota exceeded'); }, batch() { throw Error('free quota exceeded'); } } };
  assert.equal((await handleRequest(visit(), env)).status, 503);
  assert.equal((await handleRequest(new Request('https://example.workers.dev/stats'), env)).status, 503);
});
test('invalid coordinates do not become zero-zero; no IP is stored', () => {
  assert.equal(approximateLocation({ country: 'US', latitude: null, longitude: null }), null);
  assert.equal(approximateLocation({ country: 'US', latitude: '', longitude: '' }), null);
  assert.equal(approximateLocation({ country: 'XX', latitude: 1, longitude: 2 }), null);
  assert.equal(approximateLocation({ country: 'US', latitude: 100, longitude: 2 }), null);
  assert.ok(!schema.toLowerCase().includes('ip_address'));
});
test('old deduplication records expire without decrementing aggregates', async () => {
  const { sql, env } = fixture();
  sql.prepare('INSERT INTO visitor_events(event_id,created_at,day,observed_at) VALUES (?,?,?,?)').run(randomUUID(), Date.now()-8*86400000, '2020-01-01', '2020-01-01T00:00:00Z');
  await handleRequest(visit(), env);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM visitor_events').get().count, 1);
  assert.equal(sql.prepare('SELECT visits FROM visitor_totals').get().visits, 2); sql.close();
});
