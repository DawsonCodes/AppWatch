# Design assets

Source artwork for the AppWatch visual identity (original work, © 2026 DawsonCodes).

- `og-image.svg` — source for the social preview image.
- `public/favicon.svg` — the favicon/logo mark, used directly by the site.

The PNG derivatives shipped in `public/` (`og-image.png`, `apple-touch-icon.png`,
`icons/icon-192.png`, `icons/icon-512.png`) are rasterized from these SVGs. To
regenerate them after editing the SVGs, run from the repository root:

```bash
npx --yes --package=sharp node -e "
const sharp = require('sharp');
const fs = require('node:fs');
fs.mkdirSync('public/icons', { recursive: true });
const fav = fs.readFileSync('public/favicon.svg');
const og = fs.readFileSync('assets/og-image.svg');
Promise.all([
  sharp(fav, { density: 300 }).resize(192, 192).png().toFile('public/icons/icon-192.png'),
  sharp(fav, { density: 300 }).resize(512, 512).png().toFile('public/icons/icon-512.png'),
  sharp(fav, { density: 300 }).resize(180, 180).png().toFile('public/apple-touch-icon.png'),
  sharp(og, { density: 150 }).resize(1200, 630).png({ compressionLevel: 9 }).toFile('public/og-image.png'),
]).then(() => console.log('done'));
"
```

`sharp` is intentionally not a project dependency — it is only needed for this
one-off step.
