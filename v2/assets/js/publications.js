export function initPublications() {
  const section = document.getElementById('publications');
  const list = document.getElementById('publication-list');
  const filters = document.getElementById('publication-filters');
  if (!section || !list || !filters) return null;
  const cards = [...list.querySelectorAll('.publication-card')];
  const buttons = [...filters.querySelectorAll('button')];
  function setFilter(mode) {
    section.dataset.pubFilter = mode;
    for (const button of buttons) {
      const active = button.dataset.filter === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const card of cards) card.hidden = mode === 'selected' && card.dataset.selected !== 'true';
    for (const group of list.querySelectorAll('.publication-group')) {
      group.hidden = ![...group.querySelectorAll('.publication-card')].some(card => !card.hidden);
    }
    list.scrollTop = 0;
  }
  function revealHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (['selected', 'all', 'preprints'].includes(id)) {
      setFilter(id === 'selected' ? 'selected' : 'all');
      section.scrollIntoView({ block: 'start' });
    }
    const card = document.getElementById(id);
    if (card && cards.includes(card)) {
      if (card.dataset.selected !== 'true') setFilter('all');
      requestAnimationFrame(() => {
        section.scrollIntoView({ block: 'start' });
        const offset = card.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.scrollTop += offset - 14;
      });
    }
  }
  buttons.forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  filters.hidden = false;
  setFilter(document.body.dataset.defaultFilter || 'selected');
  addEventListener('hashchange', revealHash);
  revealHash();
  return {
    setSelected(ids) {
      const selected = new Set(ids);
      cards.forEach(card => { card.dataset.selected = String(selected.has(card.id)); });
      filters.querySelector('[data-filter="selected"] .publication-count').textContent = cards.filter(card => selected.has(card.id)).length;
      setFilter(section.dataset.pubFilter);
      revealHash();
    }
  };
}
