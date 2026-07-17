# Changelog

All notable changes to AppWatch are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
  `status.json` every 5 minutes (visible tabs only) and offers a one-click,
  non-disruptive data refresh when a newer checker run has been deployed.
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

- Complete interface redesign: quieter handcrafted look, compact header with a
  check-health chip, new wordmark ("App" neutral / "Watch" blue, no gradients
  or glow), focused intro, and a responsive side-panel/full-sheet detail
  experience with focus restoration and deep links.
- Scheduled checks now run exactly twice a day at 12:00 AM and 12:00 PM
  America/Detroit (UTC cron candidates at 4/5/16/17 with a timezone gate;
  manual runs unaffected).
- Brand assets (favicon, PWA icons, social image) recolored to the restrained
  blue identity.

### Fixed

- The search field no longer shows two stacked focus rings — exactly one
  visible focus indicator remains, without removing keyboard focus visibility.
- Recently updated apps (e.g. Signal after an update) no longer look
  permanently hovered/selected: recency is now a quiet left accent stripe and
  label, distinct from hover, keyboard focus, watched, open and failed states.

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
