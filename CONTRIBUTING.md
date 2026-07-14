# Contributing to AppWatch

Thanks for your interest in improving AppWatch! Contributions of all kinds are
welcome: bug fixes, features, documentation, and suggestions for apps to track.

## Getting started

```bash
git clone https://github.com/DawsonCodes/AppWatch.git
cd AppWatch
npm ci
npm run dev        # start the dev server
```

Node.js 20 or newer is required (the project is developed on Node 22, see `.nvmrc`).

## Useful commands

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `npm run dev`           | Vite dev server with hot reload                           |
| `npm test`              | Run the Vitest suite once                                 |
| `npm run test:watch`    | Run tests in watch mode                                   |
| `npm run lint`          | ESLint over the whole repo                                |
| `npm run typecheck`     | TypeScript type checking                                  |
| `npm run format`        | Format everything with Prettier                           |
| `npm run check:updates` | Run the store checker locally (hits live store endpoints) |
| `npm run validate:data` | Validate the generated JSON in `public/data/`             |
| `npm run verify`        | Everything CI runs, in one go                             |
| `npm run build`         | Production build into `dist/`                             |

## Before opening a pull request

1. Run `npm run verify` — it must pass.
2. Add or update tests for behavior changes. Store-provider tests must use
   mocked responses; the test suite must never call live store endpoints.
3. Keep the checker polite: no reduced delays, no extra endpoints, no
   aggressive retry policies.
4. Follow the existing code style (Prettier and ESLint enforce most of it).

## Adding an app to the public dashboard

Edit `apps.config.json` and add a store URL (or an object with `platform` and
`id`) to the `apps` array — see the README for the accepted formats. Open a
pull request with just that change; history for the new app starts accumulating
after the next scheduled check.

## Reporting bugs and requesting features

Use the [issue templates](https://github.com/DawsonCodes/AppWatch/issues/new/choose).
For security issues, please use private reporting — see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.
