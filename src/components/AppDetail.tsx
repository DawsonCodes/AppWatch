import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppRecord, VersionHistoryEntry } from '../shared/types.ts';
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDateTime,
  relativeTime,
} from '../lib/format.ts';
import { configSnippetFor } from '../lib/localApps.ts';
import type { AppSource } from './AppCard.tsx';
import { AppIcon } from './AppIcon.tsx';
import { AlertIcon, CheckIcon, CloseIcon, CopyIcon, ExternalIcon, RefreshIcon } from './Icons.tsx';
import { PlatformBadge, platformLabel } from './PlatformBadge.tsx';
import { WatchButton } from './WatchButton.tsx';

export type HistoryState =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; entries: VersionHistoryEntry[] };

interface AppDetailProps {
  app: AppRecord;
  source: AppSource;
  history: HistoryState;
  watched: boolean;
  onToggleWatch: (id: string) => void;
  onClose: () => void;
  onRefreshLocal?: (id: string) => void;
  localRefreshing?: boolean;
  localAddedAt?: string | null;
}

const CLOSE_ANIMATION_MS = 220;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function CopyButton({
  value,
  label,
  copiedLabel,
  ghost = true,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  ghost?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button
      type="button"
      class={`button${ghost ? ' button--ghost' : ''}`}
      onClick={copy}
      aria-live="polite"
    >
      {state === 'copied' ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      {state === 'copied' ? copiedLabel : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="detail__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function HistorySection({
  history,
  currentVersion,
}: {
  history: HistoryState;
  currentVersion: string | null;
}) {
  if (history.phase === 'loading') {
    return <p class="detail__note">Loading version history…</p>;
  }
  if (history.phase === 'error') {
    return (
      <p class="detail__note detail__note--error">
        <AlertIcon size={14} /> Version history could not be loaded.
      </p>
    );
  }
  if (history.entries.length === 0) {
    return (
      <p class="detail__note">
        No history recorded yet. Entries accumulate as the checker detects new versions.
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

/**
 * The app detail experience: a side panel on wide screens, a full-height
 * sheet on small ones. Built on <dialog> for correct focus trapping and
 * Escape handling, with an animated close that respects reduced motion.
 * Focus restoration to the triggering control is handled by the opener.
 */
export function AppDetail({
  app,
  source,
  history,
  watched,
  onToggleWatch,
  onClose,
  onRefreshLocal,
  localRefreshing = false,
  localAddedAt,
}: AppDetailProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => clearTimeout(closingTimer.current);
  }, []);

  function animatedClose() {
    const dialog = dialogRef.current;
    if (!dialog || !dialog.open) return;
    if (reducedMotion()) {
      dialog.close();
      return;
    }
    dialog.classList.add('detail--closing');
    clearTimeout(closingTimer.current);
    closingTimer.current = setTimeout(() => dialog.close(), CLOSE_ANIMATION_MS);
  }

  const releasedAgo = relativeTime(app.releaseDate);
  const detailUrl = (() => {
    const url = new URL(location.href);
    url.hash = `app=${app.id}`;
    return url.toString();
  })();

  const size = formatBytes(app.sizeBytes);
  const ratingCount = formatCount(app.ratingCount);

  return (
    <dialog
      ref={dialogRef}
      class="detail"
      aria-labelledby="detail-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        animatedClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> element itself.
        if (event.target === dialogRef.current) animatedClose();
      }}
    >
      <div class="detail__scroll">
        <div class="detail__bar">
          <button
            type="button"
            class="icon-button"
            onClick={animatedClose}
            aria-label="Close details"
          >
            <CloseIcon size={17} />
          </button>
          <span class="detail__bar-title" aria-hidden="true">
            {app.name}
          </span>
          <CopyButton value={detailUrl} label="Copy link" copiedLabel="Link copied" />
        </div>

        <header class="detail__hero">
          <AppIcon name={app.name} iconUrl={app.iconUrl} size={72} />
          <div class="detail__heading">
            <h2 id="detail-title">{app.name}</h2>
            {app.developer ? <p class="detail__developer">{app.developer}</p> : null}
            <div class="detail__badges">
              <PlatformBadge platform={app.platform} />
              {app.category ? <span class="badge">{app.category}</span> : null}
              {source === 'local' ? <span class="badge badge--local">Local watch</span> : null}
            </div>
          </div>
        </header>

        {app.checkStatus === 'error' ? (
          <p class="notice notice--error">
            <AlertIcon size={14} /> The most recent store check failed
            {app.checkError ? `: ${app.checkError}` : '.'} Data shown below is from the last
            successful check.
          </p>
        ) : null}

        {source === 'local' ? (
          <p class="notice">
            This app is watched <strong>only in this browser</strong>. It isn’t tracked by the
            repository’s scheduled checker and has no automatic version history.
          </p>
        ) : null}

        <div class="detail__actions">
          <a
            class="button button--primary"
            href={app.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on {platformLabel(app.platform)} <ExternalIcon size={13} />
          </a>
          <WatchButton
            appName={app.name}
            watched={watched}
            onToggle={() => onToggleWatch(app.id)}
          />
          {source === 'local' && app.platform === 'apple' && onRefreshLocal ? (
            <button
              type="button"
              class="button button--ghost"
              disabled={localRefreshing}
              onClick={() => onRefreshLocal(app.id)}
            >
              <RefreshIcon size={13} /> {localRefreshing ? 'Refreshing…' : 'Refresh info'}
            </button>
          ) : null}
        </div>

        <dl class="detail__facts">
          <Fact label="Current version">{app.currentVersion ?? 'unknown'}</Fact>
          {app.previousVersion ? <Fact label="Previous version">{app.previousVersion}</Fact> : null}
          {app.releaseDate ? (
            <Fact label="Released">
              {formatDate(app.releaseDate)}
              {releasedAgo ? ` (${releasedAgo})` : ''}
            </Fact>
          ) : null}
          {app.lastUpdatedAt ? (
            <Fact label="Update detected">{formatDateTime(app.lastUpdatedAt)}</Fact>
          ) : null}
          {source === 'tracked' && app.lastCheckedAt ? (
            <Fact label="Last checked">{formatDateTime(app.lastCheckedAt)}</Fact>
          ) : null}
          {source === 'tracked' ? (
            <Fact label="Tracked since">{formatDate(app.firstTrackedAt)}</Fact>
          ) : (
            <Fact label="Added here">{localAddedAt ? formatDate(localAddedAt) : '—'}</Fact>
          )}
          {app.price ? <Fact label="Price">{app.price}</Fact> : null}
          {typeof app.rating === 'number' ? (
            <Fact label="Rating">
              {app.rating.toFixed(1)} / 5{ratingCount ? ` (${ratingCount} ratings)` : ''}
            </Fact>
          ) : null}
          {app.contentRating ? <Fact label="Content rating">{app.contentRating}</Fact> : null}
          {app.requiresOs ? <Fact label="Requires">{app.requiresOs}</Fact> : null}
          {size ? <Fact label="Size">{size}</Fact> : null}
          {app.bundleId ? <Fact label="Bundle ID">{app.bundleId}</Fact> : null}
          <Fact label={app.platform === 'apple' ? 'App Store ID' : 'Package name'}>
            {app.storeId}
          </Fact>
          {app.developerWebsite ? (
            <Fact label="Developer site">
              <a href={app.developerWebsite} target="_blank" rel="noopener noreferrer">
                {new URL(app.developerWebsite).hostname} <ExternalIcon size={11} />
              </a>
            </Fact>
          ) : null}
        </dl>

        <section class="detail__section" aria-label="Current release notes">
          <h3>What’s new{app.currentVersion ? ` in ${app.currentVersion}` : ''}</h3>
          {app.releaseNotes ? (
            <p class="release-notes">{app.releaseNotes}</p>
          ) : (
            <p class="detail__note">
              {source === 'local'
                ? 'Release notes are not available for browser-local watches.'
                : 'No release notes provided by the store.'}
            </p>
          )}
        </section>

        {source === 'tracked' ? (
          <section class="detail__section" aria-label="Version history">
            <h3>Version history</h3>
            <HistorySection history={history} currentVersion={app.currentVersion} />
          </section>
        ) : (
          <section class="detail__section" aria-label="Repository tracking">
            <h3>Want global tracking?</h3>
            <p class="detail__note">
              Repository-tracked apps get scheduled checks and stored version history for every
              visitor. To request that, copy the config line below and open a tracking request —
              nothing is sent automatically.
            </p>
            <div class="detail__actions">
              <CopyButton
                value={configSnippetFor({ storeUrl: app.storeUrl })}
                label="Copy config line"
                copiedLabel="Copied"
              />
              <a
                class="button button--ghost"
                href="https://github.com/DawsonCodes/AppWatch/issues/new?template=app_request.yml"
                target="_blank"
                rel="noopener noreferrer"
              >
                Request tracking <ExternalIcon size={12} />
              </a>
            </div>
          </section>
        )}
      </div>
    </dialog>
  );
}
