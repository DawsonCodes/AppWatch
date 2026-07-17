/*
 * Applies the saved theme before first paint to avoid a flash of the wrong
 * theme. Kept as a small external file so the site's Content Security Policy
 * can stay strict (no inline scripts).
 *
 * Resolution order (mirrors src/lib/theme.ts — keep in sync):
 *   1. A saved AppWatch theme: gray-dark | light | ms-paint
 *      ("dark", saved by v1.0, is migrated to gray-dark.)
 *   2. Otherwise the operating-system preference picks gray-dark or light.
 *   3. MS Paint is never selected automatically.
 */
(function () {
  var theme = null;
  try {
    var saved = localStorage.getItem('appwatch:theme');
    if (saved === 'gray-dark' || saved === 'light' || saved === 'ms-paint') theme = saved;
    else if (saved === 'dark') theme = 'gray-dark';
  } catch (error) {
    /* storage unavailable: fall through to the OS preference */
  }
  if (!theme) {
    var prefersLight = false;
    try {
      prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch (error) {
      /* matchMedia unavailable: keep the dark default */
    }
    theme = prefersLight ? 'light' : 'gray-dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  var colors = { 'gray-dark': '#17191d', light: '#f4f5f7', 'ms-paint': '#c0c0c0' };
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta && colors[theme]) meta.setAttribute('content', colors[theme]);
})();
