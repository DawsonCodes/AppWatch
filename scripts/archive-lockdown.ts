/** Run only in the existing scheduled/manual checker, with a private repo-scoped token. */
import { appendFileSync } from 'node:fs';
import { archiveLockdown } from './lib/lockdown-archive.ts';

async function main(): Promise<void> {
  const token = process.env.LOCKDOWN_ARCHIVE_TOKEN;
  const version = process.env.LOCKDOWN_VERSION;
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!token) {
    console.log(
      '::warning::Private installer archive is not enabled. Add LOCKDOWN_ARCHIVE_TOKEN to AppWatch Actions secrets.',
    );
    if (summary)
      appendFileSync(
        summary,
        '\n## Private installer archive\n\nNot enabled: LOCKDOWN_ARCHIVE_TOKEN is missing. No installer was saved.\n',
      );
    return;
  }
  if (!version) throw new Error('No successful Windows release check was supplied to the archive.');
  const result = await archiveLockdown({ token, version });
  const message =
    result.status === 'archived'
      ? 'Saved and verified Windows ' + result.version + ' in the private Dawson Bot archive.'
      : 'Windows ' +
        result.version +
        ' is already archived and verified; no installer download was needed.';
  console.log(message);
  if (summary) appendFileSync(summary, '\n## Private installer archive\n\n' + message + '\n');
}

main().catch((error: unknown) => {
  // Never print HTTP bodies, private configuration, headers, or the token.
  const message = error instanceof Error ? error.message : 'Private installer archiving failed.';
  console.error('::warning::' + message.replace(/[\r\n]/g, ' '));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      '\n## Private installer archive\n\nArchive incomplete. Review the archive step; existing versions were retained.\n',
    );
  }
  process.exitCode = 1;
});
