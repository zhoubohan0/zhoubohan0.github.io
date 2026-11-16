// Dependency-free browser acceptance checks (Node 22+, an isolated CDP browser).
import fs from 'node:fs/promises';
import path from 'node:path';

const [endpoint, baseURL, output] = process.argv.slice(2);
if (!endpoint || !baseURL || !output) throw new Error('Usage: node browser_qa.mjs CDP_WEBSOCKET BASE_URL OUTPUT_DIR');
await fs.mkdir(output, { recursive: true });
const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let serial = 0;
const pending = new Map();
const browserErrors = [];
const sessionErrors = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer); pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params.exceptionDetails;
    const entry = detail.exception?.description || detail.text;
    browserErrors.push(entry);
    sessionErrors.get(message.sessionId)?.push(entry);
  }
});
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: '+method)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
const context = await call('Target.createBrowserContext');
const results = [];
function assert(condition, message) { if (!condition) throw new Error(message); results.push(message); }
async function newPage() {
  const { targetId } = await call('Target.createTarget', { url: 'about:blank', browserContextId: context.browserContextId });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  sessionErrors.set(sessionId, []);
  await call('Page.enable', {}, sessionId); await call('Runtime.enable', {}, sessionId);
  return sessionId;
}
async function evaluate(session, expression) {
  const value = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
  return value.result.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(session, condition, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await evaluate(session, condition)) return; } catch { /* Navigation can replace the execution context. */ }
    await pause(100);
  }
  throw new Error('Condition timed out: '+condition);
}
async function navigate(session, route = '/') {
  const target = new URL(route, baseURL).href;
  await call('Page.navigate', { url: target }, session);
  await waitFor(session, `location.href === ${JSON.stringify(target)} && document.readyState === 'complete'`);
  await evaluate(session, 'document.fonts.ready.then(() => true)');
}
async function screenshot(session, name) {
  const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, session);
  await fs.writeFile(path.join(output, name+'.png'), Buffer.from(data, 'base64'));
}
try {
  const page = await newPage();
  for (const width of [1440, 1024, 768, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 }, page);
    await call('Emulation.setTouchEmulationEnabled', { enabled: width === 390 }, page);
    await navigate(page);
    await waitFor(page, 'document.querySelectorAll(".publication-card:not([hidden])").length === 8');
    for (const theme of ['light', 'dark']) {
      if (await evaluate(page, 'document.documentElement.dataset.theme') !== theme) await evaluate(page, 'document.querySelector(".theme-toggle").click()');
      assert(await evaluate(page, `document.documentElement.dataset.theme === '${theme}'`), `${width}: ${theme} theme toggle`);
      await pause(280);
      const layout = await evaluate(page, `({viewport:innerWidth,width:document.documentElement.scrollWidth,nav:document.querySelector('.profile-nav').getBoundingClientRect().right})`);
      assert(layout.width <= layout.viewport + 1 && layout.nav <= layout.viewport + 1, `${width}/${theme}: no horizontal overflow`);
      await screenshot(page, `home-${width}-${theme}`);
    }
    if (width <= 1024) {
      await evaluate(page, 'document.querySelector("#nav-toggle").click()');
      assert(await evaluate(page, 'document.querySelector("#nav-toggle").getAttribute("aria-expanded") === "true"'), `${width}: mobile menu opens`);
      const menu = await evaluate(page, '(()=>{const r=document.querySelector("#nav-links").getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()');
      assert(menu.left >= -1 && menu.right <= menu.width + 1, `${width}: menu fits viewport`);
      await screenshot(page, `menu-${width}`);
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
      assert(await evaluate(page, 'document.querySelector("#nav-toggle").getAttribute("aria-expanded") === "false"'), `${width}: Escape closes mobile menu`);
    }
  }
  assert(await evaluate(page, 'document.fonts.check(\'28px "Ma Shan Zheng"\', "周伯涵")'), 'Chinese-name font loaded');
  assert(await evaluate(page, 'document.querySelectorAll(".contact-links [data-social]").length === 7'), 'Only seven active social links');
  assert(await evaluate(page, 'document.querySelector(\'[data-social="openreview"]\').href === "https://openreview.net/profile?id=%7EBohan_Zhou1"'), 'OpenReview URL correct');
  assert(await evaluate(page, 'document.querySelectorAll(\'[data-social="x"],[data-social="instagram"],[data-social="huggingface"],[data-social="modelscope"],[data-social="douyin"]\').length === 0'), 'Optional social entries are comments, not elements');
  await evaluate(page, 'document.querySelector(\'[data-filter="all"]\').click()');
  assert(await evaluate(page, 'document.querySelectorAll(".publication-card:not([hidden])").length === 19'), 'All filter shows 19 papers');
  await evaluate(page, 'document.querySelector(\'[data-filter="selected"]\').click()');
  assert(await evaluate(page, 'document.querySelectorAll(".publication-card:not([hidden])").length === 8'), 'Selected filter shows eight papers');
  await evaluate(page, 'document.querySelector("#news-toggle").click()');
  assert(await evaluate(page, '[...document.querySelectorAll(".news-item")].filter(e=>getComputedStyle(e).display!=="none").length === 13'), 'Expanded News shows exactly 13 entries');
  await evaluate(page, 'document.querySelector("#news-toggle").click()');
  assert(await evaluate(page, '[...document.querySelectorAll(".news-item")].filter(e=>getComputedStyle(e).display!=="none").length === 5'), 'News collapse retains template behavior');
  await evaluate(page, 'location.hash="being-0"');
  await waitFor(page, 'document.querySelector("#publications").dataset.pubFilter === "all"');
  assert(await evaluate(page, '!document.getElementById("being-0").hidden'), 'Non-selected deep link reveals paper');

  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, page);
  await navigate(page, '/publications/');
  await waitFor(page, 'document.querySelectorAll(".publication-card:not([hidden])").length === 19');
  assert(await evaluate(page, 'document.querySelectorAll(".publication-description").length === 19'), 'Full publication page retains 19 descriptions');
  await evaluate(page, 'document.documentElement.dataset.theme==="dark" && document.querySelector(".theme-toggle").click()');
  const images = await evaluate(page, `Promise.all([...document.images].map(img=>{img.loading='eager';return img.decode().then(()=>({src:img.getAttribute('src'),ok:true})).catch(()=>({src:img.getAttribute('src'),ok:false}));}))`);
  assert(images.every(image => image.ok), 'All publication images decode');
  await screenshot(page, 'publications-1440');
  await navigate(page, '/');
  await evaluate(page, 'document.documentElement.dataset.theme==="dark" && document.querySelector(".theme-toggle").click()');
  await evaluate(page, 'document.getElementById("experience").scrollIntoView({behavior:"instant"})');
  await pause(180);
  assert(await evaluate(page, '[...document.querySelectorAll(".institution-logo img")].every(img=>getComputedStyle(img).objectFit==="contain")'), 'Organization logos preserve complete aspect ratio');
  const toggleId = await evaluate(page, 'document.querySelector(".description-toggle:not([hidden])")?.getAttribute("aria-controls")');
  if (toggleId) {
    await evaluate(page, `document.querySelector('[aria-controls="${toggleId}"]').click()`);
    assert(await evaluate(page, `document.querySelector('[aria-controls="${toggleId}"]').getAttribute('aria-expanded') === 'true'`), 'Long description expands');
  }
  await screenshot(page, 'experience-1440');
  assert(sessionErrors.get(page).length === 0, 'No v2 JavaScript exceptions');

  const noJS = await newPage();
  await call('Emulation.setScriptExecutionDisabled', { value: true }, noJS);
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false }, noJS);
  await navigate(noJS);
  assert(await evaluate(noJS, '[...document.querySelectorAll(".publication-card")].filter(e=>getComputedStyle(e).display!=="none").length === 19'), 'No-JS: all 19 papers readable');
  assert(await evaluate(noJS, '[...document.querySelectorAll(".news-item")].filter(e=>getComputedStyle(e).display!=="none").length === 13'), 'No-JS: all 13 news readable');
  assert(await evaluate(noJS, 'document.querySelectorAll(".contact-links a[href]").length === 7'), 'No-JS: contact links work');
  await screenshot(noJS, 'no-js-1024');

  const legacy = await newPage();
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, legacy);
  // Legacy third-party scripts are intentionally unchanged; wait for document rather than all trackers.
  await call('Page.navigate', { url: new URL('/v1/', baseURL).href }, legacy);
  await waitFor(legacy, 'document.querySelector(".news tr") !== null', 45000);
  assert(await evaluate(legacy, 'document.querySelectorAll(".news tr").length === 13'), 'v1 retains 13 visible news');
  assert(await evaluate(legacy, 'document.querySelector(\'a.nav-link[href="/v1/publications/"]\') !== null'), 'v1 navigation stays within v1');
  await screenshot(legacy, 'v1-1440');
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: results.length, checks: results, v2Errors: sessionErrors.get(page) }, null, 2)+'\n');
  console.log(`PASS: ${results.length} browser checks. Screenshots: ${output}`);
} finally {
  await call('Target.disposeBrowserContext', { browserContextId: context.browserContextId });
  socket.close();
}
