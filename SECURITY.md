# Security Policy

## Supported versions

AppWatch is a static site plus a scheduled data checker; only the latest
deployed version (the `main` branch) is supported.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead, report
them privately via GitHub's security advisories:

https://github.com/DawsonCodes/AppWatch/security/advisories/new

You can expect an initial response within a week. Please include reproduction
steps and, where relevant, the affected file or URL.

## Scope notes

- AppWatch has no server, no accounts, no cookies and stores no personal data.
  The visitor watchlist lives only in the visitor's own browser (localStorage).
- The site renders store-provided text (release notes) strictly as plain text —
  reports of any path where external content is interpreted as HTML are
  especially appreciated.
- The update checker runs in GitHub Actions with the minimum permissions it
  needs (`contents: write` for data commits; deployments use the standard
  GitHub Pages OIDC flow). No secrets or API keys are used.
