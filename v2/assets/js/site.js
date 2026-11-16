import { initPublications } from './publications.js';

const publications = initPublications();
// Configuration can update existing links, but never creates commented social entries.
fetch(new URL('../../data/site.json', import.meta.url))
  .then(response => { if (!response.ok) throw new Error('Site configuration unavailable'); return response.json(); })
  .then(config => {
    for (const item of config.social || []) {
      const link = document.querySelector(`[data-social="${CSS.escape(item.id)}"]`);
      if (!link) continue;
      if (!item.url) { link.hidden = !link.getAttribute('href'); continue; }
      const address = new URL(item.url, location.href);
      if (['https:', 'http:', 'mailto:'].includes(address.protocol)) link.href = item.url;
    }
    if (Array.isArray(config.selected)) publications?.setSelected(config.selected);
  })
  .catch(() => { /* Static content and valid default links remain usable offline. */ });

const nav = document.querySelector('.profile-nav');
const links = document.getElementById('nav-links');
const toggle = document.getElementById('nav-toggle');
function closeMenu() {
  links?.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Open navigation');
}
toggle?.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
links?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && links?.classList.contains('open')) { closeMenu(); toggle.focus(); }
});
document.addEventListener('click', event => { if (!nav?.contains(event.target)) closeMenu(); });
const sections = [...document.querySelectorAll('.section[id]')];
function updateNav() {
  nav?.classList.toggle('scrolled', scrollY > 20);
  let current = sections[0]?.id;
  for (const section of sections) if (section.getBoundingClientRect().top <= 150) current = section.id;
  for (const link of links?.querySelectorAll('a') || []) {
    const active = link.getAttribute('href') === '#' + current;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  }
}
addEventListener('scroll', updateNav, { passive: true });
updateNav();

const news = document.getElementById('news-panel');
const newsToggle = document.getElementById('news-toggle');
if (news && newsToggle) {
  news.classList.remove('expanded');
  newsToggle.hidden = false;
  newsToggle.setAttribute('aria-expanded', 'false');
  newsToggle.addEventListener('click', () => {
    const expanded = news.classList.toggle('expanded');
    newsToggle.setAttribute('aria-expanded', String(expanded));
  });
}

function measureDescriptions() {
  for (const block of document.querySelectorAll('[data-description-collapse]')) {
    const text = block.querySelector('.description-text');
    const button = block.querySelector('.description-toggle');
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
    const collapsed = lineHeight * 4;
    const full = text.scrollHeight;
    const collapsible = full > collapsed + 8;
    block.style.setProperty('--description-collapsed-height', collapsed + 'px');
    block.style.setProperty('--description-full-height', full + 'px');
    block.classList.toggle('is-collapsible', collapsible);
    button.hidden = !collapsible;
    if (!collapsible) {
      block.classList.remove('is-expanded');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Read more';
    }
  }
}
for (const block of document.querySelectorAll('[data-description-collapse]')) {
  const button = block.querySelector('.description-toggle');
  button.addEventListener('click', () => {
    const expanded = block.classList.toggle('is-expanded');
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Show less' : 'Read more';
  });
}
document.fonts.ready.then(measureDescriptions);
let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(measureDescriptions, 120); });

if (matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
  const glow = document.getElementById('cursor-glow');
  document.addEventListener('pointermove', event => {
    glow?.style.setProperty('--mx', event.clientX + 'px');
    glow?.style.setProperty('--my', event.clientY + 'px');
    glow?.classList.add('on');
  }, { passive: true });
  document.addEventListener('pointerleave', () => glow?.classList.remove('on'));
}
