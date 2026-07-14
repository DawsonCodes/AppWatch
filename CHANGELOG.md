# Changelog

All notable changes to AppWatch are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
