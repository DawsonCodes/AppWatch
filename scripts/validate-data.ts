/**
 * Validates the generated JSON files in public/data/ against the shared
 * schema and cross-checks consistency between them. Run in CI before every
 * data commit and every deployment:
 *
 *   npm run validate:data
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppsFile, HistoryFile } from '../src/shared/types.ts';
import {
  validateAppsFile,
  validateHistoryFile,
  validateStatusFile,
} from '../src/shared/validate.ts';
import { readJsonFile } from './lib/io.ts';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

let failed = false;

function report(file: string, errors: string[]): void {
  if (errors.length === 0) {
    console.log(`✓ ${file} is valid`);
  } else {
    failed = true;
    console.error(`✗ ${file}:`);
    for (const error of errors) console.error(`    ${error}`);
  }
}

const appsRaw = readJsonFile(join(dataDir, 'apps.json'));
const historyRaw = readJsonFile(join(dataDir, 'history.json'));
const statusRaw = readJsonFile(join(dataDir, 'status.json'));

report('apps.json', appsRaw === null ? ['file missing'] : validateAppsFile(appsRaw));
report('history.json', historyRaw === null ? ['file missing'] : validateHistoryFile(historyRaw));
report('status.json', statusRaw === null ? ['file missing'] : validateStatusFile(statusRaw));

// Cross-file consistency: every history key must belong to a tracked app.
if (!failed && appsRaw && historyRaw) {
  const apps = appsRaw as AppsFile;
  const history = historyRaw as HistoryFile;
  const ids = new Set(apps.apps.map((app) => app.id));
  const orphans = Object.keys(history.entries).filter((id) => !ids.has(id));
  if (orphans.length > 0) {
    failed = true;
    console.error(`✗ history.json references unknown apps: ${orphans.join(', ')}`);
  } else {
    console.log('✓ cross-file consistency ok');
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('All data files are valid.');
}
