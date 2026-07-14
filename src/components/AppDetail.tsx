import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppRecord, VersionHistoryEntry } from '../shared/types.ts';
import { formatDate, formatDateTime, relativeTime } from '../lib/format.ts';
import { AppIcon } from './AppIcon.tsx';
import { AlertIcon, CheckIcon, CloseIcon, CopyIcon, ExternalIcon, StarIcon } from './Icons.tsx';
import { PlatformBadge, platformLabel } from './PlatformBadge.tsx';

export type HistoryState =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; entries: VersionHistoryEntry[] };

interface AppDetailProps {
  app: AppRecord;
  history: HistoryState;
  watched: boolean;
  onToggleWatch: (id: string) => void;
  onClose: () => void;
}

function MetaRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div class="detail__meta-row">
      <dt>{label}</dt>
      <dd title={title}>{value}</dd>
    </div>
  );
}

function CopyLinkButton({ appId }: { appId: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const url = new URL(location.href);
    url.hash = `app=${appId}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button type="button" class="button" onClick={copy} aria-live="polite">
      {state === 'copied' ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed' : 'Copy link'}
    </button>
  );
}

function HistoryList({
  history,
  currentVersion,
}: {
  history: HistoryState;
  currentVersion: string | null;
}) {
  if (history.phase === 'loading') {
    return <p class="detail__history-note">Loading version history…</p>;
  }
  if (history.phase === 'error') {
    return (
      <p class="detail__history-note detail__history-note--error">
        <AlertIcon size={14} /> Version history could not be loaded.
      </p>
    );
  }
  if (history.entries.length === 0) {
    return (
      <p class="detail__history-note">
        No history recorded yet. Entries are added as the checker detects new versions.
      </p>
    );
  }
  return (
    <ol class="history">
      {history.entries.map((entry) => (
        <li class="history__entry" key={entry.version}>
          <div class="history__header">
            <span class="version-chip">{entry.version}</span>
            {entry.version === currentVersion ? (
              <span class="badge badge--current">Current</span>
            ) : null}
            <span class="history__dates">
              {entry.releaseDate ? <>released {formatDate(entry.releaseDate)} · </> : null}
              detected {formatDate(entry.detectedAt)}
            </span>
          </div>
          {entry.releaseNotes ? <p class="release-notes">{entry.releaseNotes}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function AppDetail({ app, history, watched, onToggleWatch, onClose }: AppDetailProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const releasedAgo = relativeTime(app.releaseDate);

  return (
    <dialog
      ref={dialogRef}
      class="detail"
      aria-labelledby="detail-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> element itself.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div class="detail__body">
        <header class="detail__header">
          <AppIcon name={app.name} iconUrl={app.iconUrl} size={80} />
          <div class="detail__heading">
            <h2 id="detail-title">{app.name}</h2>
            {app.developer ? <p class="detail__developer">{app.developer}</p> : null}
            <div class="detail__badges">
              <PlatformBadge platform={app.platform} />
              {app.category ? <span class="badge">{app.category}</span> : null}
            </div>
          </div>
          <button
            type="button"
            class="icon-button detail__close"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close details"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        {app.checkStatus === 'error' ? (
          <p class="notice notice--error">
            <AlertIcon size={14} /> The most recent store check failed
            {app.checkError ? `: ${app.checkError}` : '.'} Data shown below is from the last
            successful check.
          </p>
        ) : null}

        <dl class="detail__meta">
          <MetaRow label="Current version" value={app.currentVersion ?? 'unknown'} />
          {app.previousVersion ? (
            <MetaRow label="Previous version" value={app.previousVersion} />
          ) : null}
          {app.releaseDate ? (
            <MetaRow
              label="Released"
              value={`${formatDate(app.releaseDate)}${releasedAgo ? ` (${releasedAgo})` : ''}`}
            />
          ) : null}
          {app.lastUpdatedAt ? (
            <MetaRow
              label="Update detected"
              value={formatDateTime(app.lastUpdatedAt) ?? '—'}
              title="When AppWatch first saw the current version"
            />
          ) : null}
          {app.lastCheckedAt ? (
            <MetaRow label="Last checked" value={formatDateTime(app.lastCheckedAt) ?? '—'} />
          ) : null}
          <MetaRow label="Tracked since" value={formatDate(app.firstTrackedAt) ?? '—'} />
          {app.bundleId ? <MetaRow label="Bundle ID" value={app.bundleId} /> : null}
          <MetaRow
            label={app.platform === 'apple' ? 'App Store ID' : 'Package name'}
            value={app.storeId}
          />
        </dl>

        <div class="detail__actions">
          <a
            class="button button--primary"
            href={app.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on {platformLabel(app.platform)} <ExternalIcon size={13} />
          </a>
          <button
            type="button"
            class={`button${watched ? ' is-watched' : ''}`}
            aria-pressed={watched}
            onClick={() => onToggleWatch(app.id)}
          >
            <StarIcon size={13} filled={watched} /> {watched ? 'Watching' : 'Watch'}
          </button>
          <CopyLinkButton appId={app.id} />
        </div>

        {app.releaseNotes ? (
          <section class="detail__section" aria-label="Current release notes">
            <h3>What’s new in {app.currentVersion ?? 'this version'}</h3>
            <p class="release-notes">{app.releaseNotes}</p>
          </section>
        ) : (
          <section class="detail__section" aria-label="Current release notes">
            <h3>What’s new</h3>
            <p class="detail__history-note">No release notes provided by the store.</p>
          </section>
        )}

        <section class="detail__section" aria-label="Version history">
          <h3>Version history</h3>
          <HistoryList history={history} currentVersion={app.currentVersion} />
        </section>
      </div>
    </dialog>
  );
}
