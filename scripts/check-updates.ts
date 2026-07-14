/**
 * AppWatch update checker CLI.
 *
 * Reads apps.config.json, queries the App Store and Google Play for each
 * tracked app, and refreshes public/data/*.json when anything meaningful
 * changed. Designed to run in GitHub Actions on a schedule, but works locally:
 *
 *   npm run check:updates
 *
 * Environment variables:
 *   APPWATCH_DELAY_MS  politeness delay between store requests (default 1500)
 *
 * Exit codes: 0 = success (even with some per-app failures),
 *             1 = configuration error or every single check failed.
 */

import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig, ConfigError } from './lib/config.ts';
import { readJsonFile } from './lib/io.ts';
import { createAppleProvider } from './lib/providers/apple.ts';
import { createGooglePlayProvider } from './lib/providers/googleplay.ts';
import { runCheck } from './lib/run.ts';
import type { AppRunSummary, RunResult } from './lib/run.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const log = (message: string) => console.log(message);

function outcomeLabel(summary: AppRunSummary): string {
  switch (summary.outcome) {
    case 'new':
      return 'first snapshot';
    case 'updated':
      return `update detected (${summary.previousVersion ?? '?'} → ${summary.version ?? '?'})`;
    case 'unchanged':
      return 'up to date';
    case 'failed':
      return `check failed: ${summary.error ?? 'unknown error'}`;
  }
}

/** Emit outputs and a Markdown summary when running inside GitHub Actions. */
function reportToGitHub(result: RunResult): void {
  const { GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
  if (GITHUB_OUTPUT) {
    appendFileSync(GITHUB_OUTPUT, `changed=${result.changed}\n`);
    appendFileSync(GITHUB_OUTPUT, `updates=${result.updatesDetected}\n`);
  }
  if (GITHUB_STEP_SUMMARY) {
    const rows = result.summaries
      .map(
        (s) =>
          `| ${s.name} | ${s.platform === 'apple' ? 'App Store' : 'Google Play'} | ${
            s.version ?? '—'
          } | ${outcomeLabel(s)} |`,
      )
      .join('\n');
    appendFileSync(
      GITHUB_STEP_SUMMARY,
      `## AppWatch check\n\n` +
        `**${result.okCount}/${result.summaries.length}** checks succeeded, ` +
        `**${result.updatesDetected}** update(s) detected, ` +
        `data ${result.changed ? 'changed' : 'unchanged'}.\n\n` +
        `| App | Store | Version | Result |\n|---|---|---|---|\n${rows}\n`,
    );
  }
}

async function main(): Promise<void> {
  const configPath = join(root, 'apps.config.json');
  const rawConfig = readJsonFile(configPath);
  if (rawConfig === null) {
    throw new ConfigError(`Missing or unreadable config file: ${configPath}`);
  }
  const config = parseConfig(rawConfig);
  log(`Tracking ${config.targets.length} app(s)`);

  const delayMs = Number(process.env.APPWATCH_DELAY_MS ?? 1500);
  const result = await runCheck({
    config,
    providers: {
      apple: createAppleProvider({ log }),
      google: createGooglePlayProvider({ log }),
    },
    dataDir: join(root, 'public', 'data'),
    delayMs: Number.isFinite(delayMs) ? delayMs : 1500,
    log,
  });

  log('');
  for (const summary of result.summaries) {
    log(`- ${summary.name} [${summary.platform}]: ${outcomeLabel(summary)}`);
  }
  log('');
  log(
    `Done: ${result.okCount} ok, ${result.errorCount} failed, ` +
      `${result.updatesDetected} update(s) detected, data ${result.changed ? 'CHANGED' : 'unchanged'}.`,
  );
  reportToGitHub(result);

  if (result.summaries.length > 0 && result.okCount === 0) {
    throw new Error('Every check failed — aborting so the failure is visible in CI.');
  }
}

main().catch((error) => {
  console.error(error instanceof ConfigError ? `Configuration error: ${error.message}` : error);
  process.exitCode = 1;
});
