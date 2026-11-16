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
  for (const width of [1440, 1209, 1024, 768, 640, 390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 1209 ? 984 : 900, deviceScaleFactor: 1, mobile: width === 390 }, page);
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
  assert(await evaluate(page, 'document.querySelectorAll(".contact-links [data-social]").length === 11'), 'Eleven active social links');
  assert(await evaluate(page, 'document.querySelector(\'[data-social="openreview"]\').href === "https://openreview.net/profile?id=%7EBohan_Zhou1"'), 'OpenReview URL correct');
  assert(await evaluate(page, 'document.querySelectorAll(\'[data-social="x"],[data-social="instagram"],[data-social="modelscope"]\').length === 0'), 'Three optional social entries are comments, not elements');
  assert(await evaluate(page, 'JSON.stringify([...document.querySelectorAll(".contact-links [data-social]")].slice(-4).map(e=>e.dataset.social))===JSON.stringify(["linkedin","bilibili","douyin","huggingface"])'), 'New social links follow the supplied order');
  await evaluate(page, 'document.querySelector(\'[data-filter="all"]\').click()');
  assert(await evaluate(page, 'document.querySelectorAll(".publication-card:not([hidden])").length === 19'), 'All filter shows 19 papers');
  assert(await evaluate(page, '[...document.querySelectorAll(".publication-card")].every(e=>getComputedStyle(e).boxShadow.includes("inset") === (e.dataset.firstAuthor==="true"))'), 'All: accent rails follow first authorship, not Selected');
  await evaluate(page, 'document.querySelector("#roboaware").scrollIntoView({behavior:"instant",block:"center"})');
  const firstAuthorBox=await evaluate(page,'(()=>{const r=document.querySelector("#roboaware").getBoundingClientRect();return {x:r.left+r.width/2,y:Math.max(100,r.top+20)}})()');
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...firstAuthorBox},page);
  assert(await evaluate(page,'getComputedStyle(document.querySelector("#roboaware")).boxShadow.includes("inset")'),'First-author rail survives hover');
  await evaluate(page, 'document.querySelector(\'[data-filter="selected"]\').click()');
  assert(await evaluate(page, 'document.querySelectorAll(".publication-card:not([hidden])").length === 8'), 'Selected filter shows eight papers');
  assert(await evaluate(page, '[...document.querySelectorAll(".publication-card:not([hidden])")].every(e=>getComputedStyle(e).boxShadow.includes("inset") === (e.dataset.firstAuthor==="true"))'), 'Selected: first-author accent is still visible');
  assert(await evaluate(page, '[...document.querySelectorAll(".news-item")].filter(e=>getComputedStyle(e).display!=="none").length === 13 && !document.querySelector("#news-toggle")'), 'All 13 News entries are in the scroll panel');
  assert(await evaluate(page, '(()=>{const n=document.querySelector("#news-panel");n.scrollTop=n.scrollHeight;return getComputedStyle(n).overflowY==="auto"&&n.scrollHeight>n.clientHeight&&n.scrollTop>0})()'), 'News panel scrolls to older entries');
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
  assert(await evaluate(page, '[...document.querySelectorAll(".institution-logo")].every(e=>{const s=getComputedStyle(e);return s.borderTopWidth==="0px"&&s.borderRadius==="0px"&&s.paddingTop==="0px"})'), 'Organization logo frames and padding are removed');
  assert(await evaluate(page, '[...document.querySelectorAll(".education-row .institution-logo")].every(e=>Math.abs(e.getBoundingClientRect().height-79.2)<1)'), 'Education logos have three text lines of height');
  assert(await evaluate(page, '[...document.querySelectorAll(".experience-entry .institution-logo")].every(e=>Math.abs(e.getBoundingClientRect().height-61.2)<1)'), 'Experience logos have heading-plus-role height');
  assert(await evaluate(page, 'document.querySelectorAll("#services .service-row .service-copy").length===2 && !document.querySelector("#skills") && !document.querySelector("#location")'), 'Services cards and requested section removal');
  assert(await evaluate(page, 'document.querySelectorAll(".teaching-list li").length===2&&document.querySelector(".teaching-list").textContent.includes("Fundamental Computing with C++")&&document.querySelector(".teaching-list").textContent.includes("2026 Fall")&&document.querySelector(".teaching-list").textContent.includes("Senior Lecturer")'), 'Teaching lists two courses with term, instructor and background');
  assert(await evaluate(page, '(()=>{const t=document.querySelectorAll(".service-copy")[1].textContent;return !t.includes("Conference:")&&["ICLR 2025","ICML 2025","NeurIPS 2025","AAAI 2026","AAAI 2027","ICLR 2027"].every(v=>t.includes(v))})()'), 'Reviewer venues reflect the supplied update');
  assert(await evaluate(page, 'document.querySelector(".friend-link .friend-name").textContent==="Qize Yu"'), 'Qize Yu is the first coauthor link');
  const logoAlpha=await evaluate(page, `Promise.all([...document.querySelectorAll('.institution-logo img')].map(async img=>{img.loading='eager';await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let clear=0,ink=0;for(let i=3;i<d.length;i+=4){if(d[i]===0)clear++;if(d[i]>200)ink++;}return {src:img.getAttribute('src'),clear,ink,total:c.width*c.height}}))`);
  assert(logoAlpha.every(logo=>logo.clear>0&&logo.ink>0), 'Every organization logo has genuine transparency and visible artwork');
  await evaluate(page, 'document.querySelector(".theme-toggle").click()');
  assert(await evaluate(page, '["knowinai","beingbeyond"].every(id=>getComputedStyle(document.querySelector("#"+id+" .institution-logo img")).filter.includes("invert"))'), 'Monochrome cutout logos stay visible in the dark theme');
  await screenshot(page, 'experience-dark-1440');
  await evaluate(page, 'document.querySelector(".theme-toggle").click()');
  assert(await evaluate(page, '(()=>{const h=document.querySelector("#pku-education-description").innerHTML;return /Research:[^<]*<span class="education-gpa">GPA:/.test(h)})()'), 'PKU GPA follows Research without a hard line break');
  assert(await evaluate(page, 'document.querySelectorAll("#friends .friend-link[href] .friend-arrow").length===3'), 'All coauthor links have distinct cards and external-link icons');
  assert(await evaluate(page, '!document.querySelector(".design-credit")'), 'Visible footer credit removed');
  assert(await evaluate(page, 'document.querySelector(".about-copy .cv-links")!==null && document.querySelector(".profile-aside .cv-links")===null'), 'CV downloads moved below the left biography');
  assert(await evaluate(page, '(()=>{const r=document.querySelector(".cv-links").getBoundingClientRect(),a=[...document.querySelectorAll(".cv-links a")].map(e=>e.getBoundingClientRect());return Math.abs(a[0].left-r.left)<1&&Math.abs(a[1].right-r.right)<1})()'), 'CV links align with opposite ends of the biography column');
  assert(await evaluate(page, 'document.querySelector(".nav-brand img").getAttribute("src")==="/_common/branding/logo.svg"'), 'Personal SVG is used in the navigation');
  const toggleId = await evaluate(page, 'document.querySelector(".description-toggle:not([hidden])")?.getAttribute("aria-controls")');
  if (toggleId) {
    await evaluate(page, `document.querySelector('[aria-controls="${toggleId}"]').click()`);
    assert(await evaluate(page, `document.querySelector('[aria-controls="${toggleId}"]').getAttribute('aria-expanded') === 'true'`), 'Long description expands');
  }
  await screenshot(page, 'experience-1440');
  await evaluate(page, 'document.getElementById("education").scrollIntoView({behavior:"instant"})');
  await screenshot(page, 'education-1440');
  await evaluate(page, 'document.getElementById("services").scrollIntoView({behavior:"instant"})');
  await screenshot(page, 'services-1440');
  await evaluate(page, 'document.getElementById("friends").scrollIntoView({behavior:"instant"})');
  await screenshot(page, 'friends-1440');
  await evaluate(page, 'document.getElementById("visitors").scrollIntoView({behavior:"instant"})');
  await waitFor(page, 'document.querySelector("#visitor-globe[data-initialized]")!==null');
  await pause(800);
  assert(await evaluate(page, 'document.querySelector("#visitor-globe").dataset.statistics==="disconnected"&&document.querySelector(".visitor-globe-status").textContent==="Statistics not connected"'), 'Visitor map has no fabricated statistics');
  assert(await evaluate(page, '!document.querySelector("#visitor-globe").classList.contains("no-webgl")'), 'Visitor globe renders with WebGL');
  assert(await evaluate(page, '!performance.getEntriesByType("resource").some(e=>e.name.includes("workers.dev"))'), 'No source-owner statistics requests');
  await evaluate(page, 'document.querySelector(".visitor-globe-toggle").click()');
  assert(await evaluate(page, 'document.querySelector(".visitor-globe-toggle").getAttribute("aria-expanded")==="true"&&!document.querySelector("#visitor-details").inert'), 'Visitor details expand');
  await evaluate(page, 'document.querySelector(".visitor-globe-canvas").focus()');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, page);
  assert(await evaluate(page, 'document.querySelector(".visitor-globe-toggle").getAttribute("aria-expanded")==="false"'), 'Visitor canvas keyboard toggle works');
  const canvasBox=await evaluate(page,'(()=>{const r=document.querySelector(".visitor-globe-canvas").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...canvasBox},page);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:canvasBox.x+45,y:canvasBox.y+10},page);
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:canvasBox.x+45,y:canvasBox.y+10},page);
  assert(await evaluate(page,'document.querySelector(".visitor-globe-toggle").getAttribute("aria-expanded")==="false"'),'Dragging globe does not toggle details');
  assert(await evaluate(page,'document.querySelector(\'#nav-links a[href="#visitors"]\').classList.contains("active")'),'Navigation highlights the footer Visitor map');
  await screenshot(page, 'visitor-map-1440');
  assert(sessionErrors.get(page).length === 0, 'No v2 JavaScript exceptions');

  const noJS = await newPage();
  await call('Emulation.setScriptExecutionDisabled', { value: true }, noJS);
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false }, noJS);
  await navigate(noJS);
  assert(await evaluate(noJS, '[...document.querySelectorAll(".publication-card")].filter(e=>getComputedStyle(e).display!=="none").length === 19'), 'No-JS: all 19 papers readable');
  assert(await evaluate(noJS, '[...document.querySelectorAll(".news-item")].filter(e=>getComputedStyle(e).display!=="none").length === 13'), 'No-JS: all 13 news readable');
  assert(await evaluate(noJS, 'document.querySelectorAll(".contact-links a[href]").length === 11'), 'No-JS: contact links work');
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
