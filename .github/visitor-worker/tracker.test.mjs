import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldTrackVisit } from '../../v2/assets/js/visitor-tracker.js';

const config = { trackEndpoint: 'https://example.workers.dev/visit', allowedHosts: ['zhoubohan0.github.io'] };
test('only the public profile documents are counted', () => {
  for (const pathname of ['/', '/index.html', '/publications/', '/v2/', '/v2/publications/index.html']) {
    assert.equal(shouldTrackVisit(config, { hostname: 'zhoubohan0.github.io', pathname }, {}), true);
  }
  for (const pathname of ['/v1/', '/RoboAware/', '/404.html']) {
    assert.equal(shouldTrackVisit(config, { hostname: 'zhoubohan0.github.io', pathname }, {}), false);
  }
});
test('localhost, preview hosts and privacy preferences never report a visit', () => {
  for (const hostname of ['localhost','127.0.0.1','preview.example.com']) {
    assert.equal(shouldTrackVisit(config, { hostname, pathname: '/' }, {}), false);
  }
  const location = { hostname: 'zhoubohan0.github.io', pathname: '/' };
  assert.equal(shouldTrackVisit(config, location, { doNotTrack: '1' }), false);
  assert.equal(shouldTrackVisit(config, location, { globalPrivacyControl: true }), false);
  assert.equal(shouldTrackVisit({ ...config, trackEndpoint: '' }, location, {}), false);
});
test('public document emits one POST even after repeated initialization and hash changes', async () => {
  const old = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const requests = [];
  globalThis.window = { location: { hostname: 'zhoubohan0.github.io', pathname: '/', hash: '' }, navigator: {} };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return new Response('{}', { status: 202 }); };
  try {
    const { initVisitTracking } = await import('../../v2/assets/js/visitor-tracker.js?once-test');
    const setup = { ...config, endpoint: 'https://example.workers.dev/stats' };
    initVisitTracking(setup);
    window.location.hash = '#news'; initVisitTracking(setup);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.credentials, 'omit');
    assert.match(JSON.parse(requests[0].options.body).eventId, /^[0-9a-f-]{36}$/);
  } finally { Object.assign(globalThis, old); }
});
