/*
 * Applies the saved theme before first paint to avoid a flash of the wrong
 * theme. Kept as a small external file so the site's Content Security Policy
 * can stay strict (no inline scripts). AppWatch is dark-first: dark is the
 * default unless the visitor chose light.
 */
(function () {
  var theme = 'dark';
  try {
    var saved = localStorage.getItem('appwatch:theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (error) {
    /* storage unavailable: keep the dark default */
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
