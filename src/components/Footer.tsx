const PAINT_SWATCHES = [
  '#000000',
  '#808080',
  '#800000',
  '#ff0000',
  '#808000',
  '#ffff00',
  '#008000',
  '#00ff00',
  '#000080',
  '#0000ff',
  '#800080',
  '#ffffff',
];

export function Footer() {
  return (
    <footer class="site-footer">
      <div class="paint-palette" aria-hidden="true">
        {PAINT_SWATCHES.map((color) => (
          <span class="paint-palette__chip" key={color} style={{ background: color }} />
        ))}
      </div>
      <div class="site-footer__inner">
        <p class="site-footer__brand">
          <span class="brand__app">App</span>
          <span class="brand__watch">Watch</span>
          <span class="site-footer__copy">© 2026 DawsonCodes · MIT License</span>
        </p>
        <p class="site-footer__privacy">
          No analytics, no cookies, no accounts. Your watchlist, local watches and theme stay in
          this browser. Store data is checked every two hours — not in real time.
        </p>
        <p class="site-footer__links">
          <a
            href="https://github.com/DawsonCodes/AppWatch"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source on GitHub
          </a>
          <a
            href="https://github.com/DawsonCodes/AppWatch/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            Report an issue
          </a>
        </p>
      </div>
    </footer>
  );
}
