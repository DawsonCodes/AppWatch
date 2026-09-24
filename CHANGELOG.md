# Changelog

All notable changes to AppWatch are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Collections** as tabs — AI, Social, Messaging, Entertainment,
  Productivity, Browsers & Privacy, Travel & Maps, Shopping & Money and
  Learning & Fitness — defined in a new `apps.config.json` format where each
  app is a name plus its App Store and/or Google Play link. The previous flat
  `apps` array still parses (into an "Other" tab).
- An **AI collection**: ChatGPT, Gemini, Grok, Microsoft Copilot, Perplexity,
  DeepSeek and Character.AI, each on both stores (56 apps / 112 listings in
  total; every previously tracked listing is kept with its history).
- An **Updates** view: every recorded release, newest first, grouped by day,
  with version changes and release notes, filtered like the grid.
- One card per app across both stores, with the **App Store in blue** and
  **Google Play in green** throughout, and a store switcher in the detail
  panel.
- Update detection for Google Play listings that publish no single version:
  a newer store release date is recorded as an update (history entries may
  now have `version: null`, unique by release date).
- A rebuilt motion system on View Transitions, springs (CSS `linear()`) and
  scroll-driven animations: cards glide between layouts, the app icon flies
  into the detail panel, views slide in the direction of travel, themes reveal
  in a circle from the theme button, tab indicators glide, and entrances
  cascade — all removed under reduced motion.
- Self-hosted Onest and Geist Mono typefaces.
- Keyboard shortcut: `/` jumps to search; Back/Forward open and close the
  detail panel.

- Three complete, user-selectable themes — **Gray Dark**, **Light** and
  **MS Paint** — driven by a token-based CSS architecture, chosen through an
  accessible dropdown, persisted locally, with the OS preference deciding the
  first visit (MS Paint is never auto-selected).
- Store-wide discovery: search accepts app names, App Store URLs, Apple
  numeric IDs, Google Play URLs and Android package names. App Store listings
  resolve live through Apple's public keyless lookup/search API (with an
  honest external-link fallback when CORS blocks it); Google Play refs can be
  watched locally with a store link since Play has no browser-readable API.
- Browser-local watches: discovered apps join the grid with a clear "Local"
  label, never claim repository tracking, and offer a copyable
  `apps.config.json` line plus a tracking-request link.
- Deploy-freshness polling: the open page revalidates the site's own
  `status.json` every 5 minutes and on tab focus (visible tabs only), and
  applies newer deployed data in place.
- Extended provider metadata where reliably available: price, content rating,
  minimum OS requirement, download size (Apple), user rating and rating count,
  and developer website — shown in the detail view, optional in the schema so
  existing data files stay valid.
- A coherent motion system (shared duration/easing tokens): button press
  feedback, animated dropdown chevrons and menus, an animated detail panel
  transition, card entrance fades, and a gold spark burst when watching an app
  — all disabled under reduced-motion.
- Collapsible, locally-persisted Insights panel replacing the row of large
  statistic cards.

### Changed

- Complete visual redesign of every surface: header, hero, controls, cards,
  detail panel (side panel on wide screens, bottom sheet on phones), insights,
  empty states, toasts and footer, across all three themes.
- Removing a browser-local watch can be undone from the confirmation toast.
- The copyable config snippet for local watches now matches the collections
  format.
- GitHub Actions updated to checkout v7, setup-node v7, configure-pages v6,
  upload-pages-artifact v5, deploy-pages v5, upload-artifact v7 and
  download-artifact v8; npm dependencies updated to their latest compatible
  releases (folds in the open Dependabot updates).

- Complete interface redesign: quieter handcrafted look, compact header with a
  check-health chip, new wordmark ("App" neutral / "Watch" blue, no gradients
  or glow), focused intro, and a responsive side-panel/full-sheet detail
  experience with focus restoration and deep links.
- Tracked catalog expanded from 8 to 100 entries: 50 popular apps, each
  tracked on both the App Store and Google Play.
- Scheduled checks now run every two hours (`17 */2 * * *`) instead of at
  fixed times, and the site is redeployed after every successful run so the
  published "last checked" time is always accurate.
- App Store apps are resolved with batched lookups (up to 50 IDs per request)
  and Google Play requests are spaced by the provider itself, so a full
  100-app check stays quick and polite.
- New deployed data is applied in place automatically while the page is open
  (with a brief confirmation), instead of waiting for a manual refresh.
- Brand assets (favicon, PWA icons, social image) recolored to the restrained
  blue identity.

### Fixed

- The search field no longer shows two stacked focus rings — exactly one
  visible focus indicator remains, without removing keyboard focus visibility.
- Recently updated apps (e.g. Signal after an update) no longer look
  permanently hovered/selected: recency is now a quiet left accent stripe and
  label, distinct from hover, keyboard focus, watched, open and failed states.
- **Data stopped updating after late August.** The previous schedule gate only
  let a run proceed at exactly 12 AM/12 PM Detroit time, but GitHub started the
  scheduled runs 3–5 hours late, so every run was skipped. The gate is gone;
  the delay-tolerant two-hour schedule always checks.
- The site could show data up to 10 minutes older than the latest deploy
  (GitHub Pages HTTP caching), and "Refresh data" could re-serve the same
  cached copy. Data requests now always revalidate with the server.
- "Last check" only moved when an app changed, so healthy runs with no
  changes made the site look stale. `status.json` is now refreshed and
  deployed on every run.
- "Try again" after a failed data load silently ran a background refresh
  that swallowed errors; it now performs a full, visible reload.
- Configured apps that have never resolved (e.g. a mistyped ID) no longer
  render as empty cards; they are listed under Insights instead.
- Google Play apps that publish no single version now say "Not listed
  (varies by device)" instead of "unknown".

## [1.0.0] - 2026-07-14

### Added

- Dashboard that tracks App Store and Google Play app updates: current and
  previous versions, release dates, relative times, release notes and full
  stored version history.
- Apple provider built on the public iTunes Lookup API.
- Google Play provider built on `google-play-scraper`, isolated in its own
  module with timeouts, bounded retries and graceful per-app failure handling.
- Human-editable tracking configuration (`apps.config.json`) accepting store
  URLs, numeric App Store IDs or Android package names.
- Version-controlled data files (`public/data/apps.json`, `history.json`,
  `status.json`) with schema validation and duplicate-history protection.
- Scheduled GitHub Actions checker (every 6 hours) that commits data only when
  something meaningful changed, plus a GitHub Pages deployment workflow.
- Search, platform/recency/watched filters, and three sort orders.
- Accessible app detail dialog with version history timeline, copy-link deep
  links (`#app=<id>`) and store links.
- Personal watchlist stored in localStorage (no accounts, no sync).
- Dark-first theme with a light mode, responsive layout, reduced-motion
  support, keyboard navigation and screen-reader-friendly status messages.
- Polished loading, empty, stale-data, partial-failure and error states.
- Strict Content Security Policy, `rel="noopener noreferrer"` on external
  links, plain-text rendering of all store-provided content.
- Original visual identity: logo, favicon, PWA icons, social preview image and
  web manifest.
- Test suite covering normalization, version comparison, update detection,
  duplicate-history prevention, provider failures, JSON validation, filtering,
  watchlist behavior and base-path-safe URLs.

[1.0.0]: https://github.com/DawsonCodes/AppWatch/releases/tag/v1.0.0
