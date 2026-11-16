// Match the reference's daylight interval; a manual choice lasts until its boundary.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  let manual = null;
  let period = null;
  function refresh() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const daylight = minutes >= 480 && minutes < 990;
    const next = `${now.toDateString()}:${daylight}:${minutes < 480}`;
    if (period !== next) manual = null;
    period = next;
    root.dataset.theme = manual || (daylight ? 'light' : 'dark');
    document.querySelectorAll('.theme-toggle').forEach(button => {
      const target = root.dataset.theme === 'light' ? 'dark' : 'light';
      button.setAttribute('aria-label', `Switch to ${target} mode`);
      button.title = `Switch to ${target} mode`;
    });
  }
  refresh();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click', () => {
      manual = root.dataset.theme === 'light' ? 'dark' : 'light';
      refresh();
    }));
    refresh();
  });
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
