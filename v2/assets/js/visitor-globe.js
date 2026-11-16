// Globe rendering and interaction adapted from https://skywalker-yqz.github.io/.
// No source-owner visitor records, manual count additions or tracking endpoints are used.
import createGlobe from '/_common/vendor/cobe-2.0.1.js';
import { visitorConfig } from './visitor-config.js';
import { createVisitorDataSource } from './visitor-data.js';
const number = new Intl.NumberFormat('en');
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function normalizeVisitorData(data) {
  if (!data || !Number.isSafeInteger(data.totalVisitors) || data.totalVisitors < 0 || !Array.isArray(data.markers)) throw new Error('Invalid visitor snapshot');
  const markers = data.markers.map(marker => {
    if (!marker || !/^[A-Z]{2}$/.test(marker.country) || !Array.isArray(marker.location) || marker.location.length !== 2 || !marker.location.every(Number.isFinite) || Math.abs(marker.location[0]) > 90 || Math.abs(marker.location[1]) > 180 || !Number.isSafeInteger(marker.visitors) || marker.visitors < 1 || marker.visitors > data.totalVisitors) throw new Error('Invalid visitor marker');
    return { country: marker.country, location: [...marker.location], visitors: marker.visitors, city: typeof marker.city === 'string' ? marker.city : '' };
  });
  if (markers.reduce((sum, marker) => sum + marker.visitors, 0) > data.totalVisitors) throw new Error('Inconsistent visitor totals');
  const maximum = Math.max(1, ...markers.map(marker => marker.visitors));
  return { totalVisitors: data.totalVisitors, totalCountries: new Set(markers.map(marker => marker.country)).size, markers: markers.map(marker => ({ ...marker, size: .026 + .044 * Math.log1p(marker.visitors) / Math.log1p(maximum) })) };
}
function visitorLocationRows(data) {
  return data.markers.map(marker => ({ label: [marker.city, countryNames.of(marker.country)].filter(Boolean).join(' – '), visits: marker.visitors })).sort((a,b) => b.visits - a.visits);
}

export function initVisitorGlobe(config = visitorConfig) {
  const host = document.getElementById('visitor-globe');
  if (!host || host.dataset.initialized) return;
  host.dataset.initialized = 'true';
  host.className = 'visitor-glass';
  host.dataset.statistics = config.endpoint ? 'configured' : 'disconnected';
  host.innerHTML = `
    <div class="visitor-globe-stage">
      <div class="visitor-globe-halo" aria-hidden="true"></div>
      <canvas class="visitor-globe-canvas" tabindex="0" role="img" aria-label="Visitor globe. Drag or use arrow keys to rotate."></canvas>
      <div class="visitor-globe-fallback" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>
    <button class="visitor-globe-toggle" type="button" aria-expanded="false" aria-controls="visitor-details">
      <span>Visitor map</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>
    </button>
    <p class="visitor-globe-status" role="status">Statistics not connected</p>
    <div class="visitor-details" id="visitor-details" aria-hidden="true" inert>
      <div class="visitor-details-inner"><p class="visitor-snapshot-date"></p><ul class="visitor-country-list"></ul></div>
    </div>`;
  const canvas = host.querySelector('canvas');
  const stage = host.querySelector('.visitor-globe-stage');
  const toggle = host.querySelector('.visitor-globe-toggle');
  const panel = host.querySelector('.visitor-details');
  const status = host.querySelector('.visitor-globe-status');
  const snapshotDate = host.querySelector('.visitor-snapshot-date');
  const countryList = host.querySelector('.visitor-country-list');
  if (!config.endpoint) snapshotDate.textContent = 'Visitor statistics are not connected yet.';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let globe, frame = 0, refreshTimer, textureRefresh, visible = false, expanded = false, dragging = false, moved = false;
  let phi = .7, theta = .18, lastX = 0, lastY = 0, previousTime = 0, lastDrawTime = 0;
  let markers = [], size = 320, renderedSize = 0;
  let inViewport = false, contextLost = false, disposed = false, needsRender = false;
  let pendingRender = {};
  const rotationFrameInterval = 1000 / 60;

  const palette = () => document.documentElement.dataset.theme === 'dark'
    ? { dark: 1, baseColor: [.37, .43, .28], markerColor: [.79, .89, .62], glowColor: [.11, .14, .08], mapBrightness: 5.5 }
    : { dark: 0, baseColor: [.67, .58, .80], markerColor: [.47, .29, .67], glowColor: [.93, .91, .96], mapBrightness: 3.2 };
  const canDraw = () => globe && inViewport && !document.hidden && !contextLost && !disposed;
  const queueFrame = () => { if (!frame && canDraw()) frame = requestAnimationFrame(tick); };
  // COBE.update draws immediately. Coalesce input, data and surface changes into
  // one frame, preserving the latest patch while the globe is offscreen.
  const render = (patch = {}) => {
    Object.assign(pendingRender, patch);
    needsRender = true;
    queueFrame();
  };
  const refreshSurface = () => {
    const patch = palette();
    if (size !== renderedSize) Object.assign(patch, { width: size, height: size });
    else {
      // A quick resize can return to the existing buffer size before its frame.
      delete pendingRender.width;
      delete pendingRender.height;
    }
    render(patch);
  };
  const tick = time => {
    frame = 0;
    if (!canDraw()) { previousTime = 0; return; }
    const rotating = !motion.matches && !dragging;
    if (rotating) phi += Math.min(40, previousTime ? time - previousTime : 16) * .000055;
    previousTime = rotating ? time : 0;
    const elapsed = time - lastDrawTime;
    const rotationDue = elapsed + .1 >= rotationFrameInterval;
    if (needsRender || (rotating && rotationDue)) {
      // Setting equal canvas dimensions still clears/reallocates its buffer.
      if (pendingRender.width === renderedSize && pendingRender.height === renderedSize) {
        delete pendingRender.width;
        delete pendingRender.height;
      }
      globe.update({ ...pendingRender, phi, theta });
      if (pendingRender.width && pendingRender.height) renderedSize = pendingRender.width;
      pendingRender = {};
      needsRender = false;
      lastDrawTime = rotationDue
        ? lastDrawTime + Math.max(1, Math.floor((elapsed + .1) / rotationFrameInterval)) * rotationFrameInterval
        : time;
    }
    if (rotating) queueFrame();
  };
  const resume = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (canDraw()) render();
  };
  const setExpanded = value => {
    expanded = value;
    host.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    panel.setAttribute('aria-hidden', String(!expanded));
    panel.inert = !expanded;
  };
  toggle.addEventListener('click', () => setExpanded(!expanded));
  canvas.addEventListener('click', () => { if (!moved) setExpanded(!expanded); });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    resume();
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    phi += dx * .006;
    theta = Math.max(-.6, Math.min(.6, theta + dy * .003));
    lastX = event.clientX;
    lastY = event.clientY;
    render();
  });
  const endDrag = () => { if (dragging) { dragging = false; resume(); } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpanded(!expanded); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    phi += event.key === 'ArrowLeft' ? -.18 : event.key === 'ArrowRight' ? .18 : 0;
    theta = Math.max(-.6, Math.min(.6, theta + (event.key === 'ArrowUp' ? -.1 : event.key === 'ArrowDown' ? .1 : 0)));
    render();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    host.classList.add('no-webgl');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    globe?.destroy(); globe = undefined; renderedSize = 0;
    createRenderer(); resume();
  });

  function createRenderer() {
    if (globe || contextLost || disposed || document.hidden || size <= 0) return;
    try {
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true }) || canvas.getContext('webgl', { alpha: true, antialias: true });
      if (!context) throw new Error('WebGL unavailable');
      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(devicePixelRatio || 1, 2), width: size, height: size,
        phi, theta, diffuse: 1.6, scale: 1, mapSamples: 16000,
        mapBaseBrightness: 0, opacity: 1, markers, ...palette(),
      });
      renderedSize = size;
      host.classList.remove('no-webgl');
      render();
      // COBE decodes its embedded map asynchronously. Redraw the stationary globe
      // after decoding even when reduced motion disables the animation loop.
      clearTimeout(textureRefresh);
      textureRefresh = setTimeout(() => render(), 500);
    } catch { host.classList.add('no-webgl'); }
  }

  let dataSource, snapshotLoadFailed = false;
  const refreshInterval = Number.isFinite(config.refreshInterval) ? Math.max(60000, config.refreshInterval) : config.provider === 'cloudflare' ? 900000 : 60000;
  function refreshData() { if (!document.hidden) return dataSource?.refresh(); }
  function scheduleRefresh() {
    clearInterval(refreshTimer);
    if (config.endpoint && visible && !document.hidden && !config.syncPaused && !disposed) {
      refreshTimer = setInterval(refreshData, refreshInterval);
    }
  }
  if (config.endpoint) {
    try {
      const endpoint = new URL(config.endpoint, location.href);
      if (endpoint.origin !== location.origin && endpoint.protocol !== 'https:') throw new Error('Invalid statistics URL');
      let storage;
      try { storage = sessionStorage; } catch { /* Private browsing can disable storage. */ }
      const fallbackEndpoints = [];
      if (config.mirrorEndpoint) {
        const mirror = new URL(config.mirrorEndpoint, location.href);
        if (mirror.origin === location.origin) fallbackEndpoints.push(mirror.href);
      }
      dataSource = createVisitorDataSource({ endpoint: endpoint.href, normalize: normalizeVisitorData, storage,
        fallbackEndpoints, maximumAge: config.maximumSnapshotAge || Infinity,
        initialPayload: config.fallbackSnapshot,
        minimumInterval: refreshInterval,
        cacheBucket: refreshInterval,
        onData(data, payload, { changed }) {
          // Display only data supplied by this website's configured endpoint.
          const totals = `${number.format(data.totalVisitors)} ${data.totalVisitors === 1 ? 'visit' : 'visits'}`;
          status.textContent = config.syncPaused ? `Map snapshot · ${totals}` : totals;
          if (typeof payload.updatedAt === 'string' && Number.isFinite(Date.parse(payload.updatedAt))) {
            const saved = new Date(payload.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
            status.title = `Updated ${saved}`;
            snapshotDate.textContent = `${config.syncPaused ? 'Map sync paused · ' : ''}Updated ${saved}`;
            snapshotDate.title = `Updated ${saved}`;
          }
          if (!changed) return;
          markers = data.markers;
          canvas.setAttribute('aria-label', `${totals}. Drag or use arrow keys to rotate. Enter opens location details.`);
          const locations = visitorLocationRows(data);
          countryList.replaceChildren(...locations.map(location => {
            const row = document.createElement('li');
            const label = document.createElement('span');
            const count = document.createElement('span');
            label.textContent = location.label;
            count.textContent = number.format(location.visits);
            row.append(label, count);
            return row;
          }));
          if (!locations.length) {
            const row = document.createElement('li'); row.textContent = data.totalVisitors ? 'No location data available' : 'No visits yet'; countryList.append(row);
          }
          render({ markers });
        },
        onState(state, payload) {
          snapshotLoadFailed = state === 'stale' || state === 'unavailable';
          // Fetching an old static file successfully does not mean collection is live.
          host.dataset.connection = config.syncPaused && payload ? 'snapshot' : state;
          if (!payload) status.textContent = state === 'loading' ? 'Loading…' : 'Unavailable';
          // Keep the last verified map and counts visible during transient errors.
          if (state === 'stale') status.title = 'Showing the last available totals. Updates will retry while the map is visible.';
        },
      });
      // Start the tiny snapshot request before the reader reaches the footer.
      refreshData();
      toggle.addEventListener('click', () => { if (expanded && (!config.syncPaused || snapshotLoadFailed)) refreshData(); });
    } catch { status.textContent = 'Unavailable'; }
  }

  if (config.publicDashboard) {
    try {
      const url = new URL(config.publicDashboard);
      if (url.protocol === 'https:') {
        const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.className = 'visitor-dashboard-link'; link.textContent = 'Latest statistics ↗';
        // Keep the provider's single, supported widget visible when the map is collapsed.
        host.append(link);
      }
    } catch { /* A missing public dashboard does not affect the globe. */ }
  }
  const sizes = new ResizeObserver(() => {
    const next = Math.round(stage.clientWidth);
    if (next <= 0 || next === size) return;
    size = next;
    if (visible) { createRenderer(); refreshSurface(); }
  });
  sizes.observe(stage);
  // Snapshot loading starts independently. Only an actually visible canvas
  // should consume continuous rendering work, including while details are open.
  const renderObserver = new IntersectionObserver(entries => {
    inViewport = entries[0].isIntersecting;
    if (inViewport) {
      size = Math.round(stage.clientWidth) || size;
      createRenderer();
      refreshSurface();
    }
    resume();
  });
  renderObserver.observe(canvas);
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) {
      size = Math.round(stage.clientWidth);
      createRenderer();
      if (!config.syncPaused || snapshotLoadFailed) refreshData();
    }
    scheduleRefresh();
    resume();
  });
  observer.observe(host);
  const theme = new MutationObserver(refreshSurface);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const onVisibilityChange = () => {
    if (visible && !document.hidden) createRenderer();
    resume();
    if (visible && !document.hidden && (!config.syncPaused || snapshotLoadFailed)) refreshData();
    scheduleRefresh();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  motion.addEventListener('change', resume);
  // Statistics collection is intentionally not configured for this site.
  return () => {
    disposed = true;
    dataSource?.dispose();
    cancelAnimationFrame(frame); clearInterval(refreshTimer); clearTimeout(textureRefresh);
    observer.disconnect(); renderObserver.disconnect(); sizes.disconnect(); theme.disconnect(); globe?.destroy();
    document.removeEventListener('visibilitychange', onVisibilityChange); motion.removeEventListener('change', resume);
  };
}
