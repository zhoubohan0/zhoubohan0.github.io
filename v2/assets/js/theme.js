// Light is the only public theme; the toggle stays commented in the nav markup.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  root.dataset.theme = 'light';
})();
