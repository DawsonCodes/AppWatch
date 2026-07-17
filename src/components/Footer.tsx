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
      <p>© 2026 DawsonCodes. Released under the MIT License.</p>
      <p class="site-footer__privacy">
        No analytics, no cookies, no accounts. Your watchlist, local watches and theme choice stay
        in this browser.
      </p>
      <p>
        <a href="https://github.com/DawsonCodes/AppWatch" target="_blank" rel="noopener noreferrer">
          Source on GitHub
        </a>
        {' · '}
        <a
          href="https://github.com/DawsonCodes/AppWatch/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          Report an issue
        </a>
      </p>
    </footer>
  );
}
