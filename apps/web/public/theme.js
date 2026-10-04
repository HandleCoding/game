(() => {
  const key = 'playroom-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {}

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f6fb' : '#101116');
    window.dispatchEvent(new CustomEvent('playroom-theme-change'));
  }

  window.playroomTheme = {
    toggle() {
      preference = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    }
  };
  system.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
    apply();
  });
  apply();
})();
