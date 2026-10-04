import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { AppGroup, Listing } from '../lib/groups.ts';
import { groupDeveloper, groupIconUrl } from '../lib/groups.ts';
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDateTime,
  relativeTime,
} from '../lib/format.ts';
import { configSnippetFor } from '../lib/localApps.ts';
import type { Flight } from '../lib/motion.ts';
import { flyBetween, isOnScreen, slideIn, slideOut } from '../lib/motion.ts';
import type { VersionHistoryEntry } from '../shared/types.ts';
import { historyEntryKey } from '../shared/types.ts';
import { AppIcon } from './AppIcon.tsx';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ExternalIcon,
  RefreshIcon,
} from './Icons.tsx';
import { Notes } from './Notes.tsx';
import { SlidingTabs } from './SlidingTabs.tsx';
import { storeLabel } from './StoreBadge.tsx';
import { WatchButton } from './WatchButton.tsx';

export type HistoryState =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; entries: VersionHistoryEntry[] };

interface AppDetailProps {
  group: AppGroup;
  listing: Listing;
  collectionLabel: string | null;
  history: HistoryState;
  watched: boolean;
  /** Set by the shell to play the exit animation; `onClosed` follows. */
  closing: boolean;
  /** The icon that was tapped to open this panel; it flies into the hero. */
  origin: HTMLElement | null;
  onSelectListing: (listingId: string) => void;
  onToggleWatch: () => void;
  /** Escape, the close button or the backdrop asked to close. */
  onRequestClose: () => void;
  /** The exit animation has finished; the shell unmounts the panel. */
  onClosed: () => void;
  onRefreshLocal?: (id: string) => void;
  localRefreshing?: boolean;
  localAddedAt?: string | null;
}

function CopyButton({ value, label, done }: { value: string; label: string; done: string }) {
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
      class={`button button--ghost copy${state === 'copied' ? ' is-done' : ''}`}
      onClick={copy}
    >
      <span class="copy__icon" aria-hidden="true">
        {state === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </span>
      <span aria-live="polite">
        {state === 'copied' ? done : state === 'failed' ? 'Copy failed' : label}
      </span>
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function History({ history, listing }: { history: HistoryState; listing: Listing }) {
  if (history.phase === 'loading') {
    return (
      <div class="history-skeleton" aria-hidden="true">
        <span class="skeleton skeleton--line" style={{ width: '45%' }} />
        <span class="skeleton skeleton--line" style={{ width: '85%' }} />
        <span class="skeleton skeleton--line" style={{ width: '65%' }} />
      </div>
    );
  }
  if (history.phase === 'error') {
    return (
      <p class="muted-note muted-note--error">
        <AlertIcon size={14} /> Version history could not be loaded.
      </p>
    );
  }
  if (history.entries.length === 0) {
    return (
      <p class="muted-note">
        No releases recorded yet — history starts with the first successful check.
      </p>
    );
  }
  return (
    <ol class="history">
      {history.entries.map((entry, index) => {
        const current =
          index === 0 &&
          (entry.version === listing.currentVersion ||
            (entry.version === null && entry.releaseDate === listing.releaseDate));
        const older = history.entries[index + 1];
        return (
          <li
            class={`history__entry${current ? ' history__entry--current' : ''}`}
            key={historyEntryKey(entry) ?? entry.detectedAt}
            style={{ '--i': Math.min(index, 10) }}
          >
            <span class="history__dot" aria-hidden="true" />
            <div class="history__head">
              {entry.version ? (
                <span class="version-chip">{entry.version}</span>
              ) : (
                <span class="version-chip version-chip--soft">Store release</span>
              )}
              {current ? <span class="tag tag--current">Current</span> : null}
              {index === history.entries.length - 1 ? (
                <span class="tag">First recorded</span>
              ) : null}
            </div>
            <p class="history__dates">
              {entry.releaseDate
                ? `Released ${formatDate(entry.releaseDate)}`
                : 'Release date unknown'}
              {' · '}
              {index === history.entries.length - 1 && !older
                ? `recorded ${formatDate(entry.detectedAt)}`
                : `detected ${formatDate(entry.detectedAt)}`}
            </p>
            {entry.releaseNotes ? <Notes text={entry.releaseNotes} clampAt={180} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The app detail experience: a panel that slides in from the right on wide
 * screens and a full-height sheet on phones. It is a modal dialog: the page
 * behind is inert and scroll-locked, Escape and the backdrop close it, and
 * focus returns to the card that opened it (handled by the app shell).
 */
export function AppDetail({
  group,
  listing,
  collectionLabel,
  history,
  watched,
  closing,
  origin,
  onSelectListing,
  onToggleWatch,
  onRequestClose,
  onClosed,
  onRefreshLocal,
  localRefreshing = false,
  localAddedAt,
}: AppDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const flight = useRef<Flight | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // Entrance: the panel slides in while the tapped icon flies into the hero.
  // Measured before the first paint, so nothing flashes in its final spot.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const hero = panel.querySelector<HTMLElement>('.detail__icon');
    if (origin && hero && isOnScreen(origin)) flight.current = flyBetween(origin, hero, 640);
    slideIn(panel, backdropRef.current);
    return () => flight.current?.cancel();
    // Runs once per opening; the shell remounts the panel for each open.
  }, []);

  // Exit: reverse from wherever the entrance got to, fly the icon home to its
  // card if that card is on screen, then let the shell unmount.
  useLayoutEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    if (!panel) {
      onClosed();
      return;
    }
    flight.current?.cancel();
    flight.current = null;
    const hero = panel.querySelector<HTMLElement>('.detail__icon');
    const card = document.querySelector<HTMLElement>(
      `.card[data-key="${CSS.escape(group.key)}"] .card__icon`,
    );
    if (hero && card) flyBetween(hero, card, 520);
    let cancelled = false;
    slideOut(panel, backdropRef.current).then(() => {
      if (!cancelled) onClosed();
    });
    return () => {
      cancelled = true;
    };
  }, [closing]);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onRequestClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onRequestClose]);

  // Show the compact title in the top bar once the big title scrolls away.
  useEffect(() => {
    const root = scrollRef.current;
    const hero = heroRef.current;
    if (!root || !hero || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(entry ? !entry.isIntersecting : false),
      { root, threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const local = listing.source === 'local';
  const developer = groupDeveloper(group);
  const releasedAgo = relativeTime(listing.releaseDate);
  const size = formatBytes(listing.sizeBytes);
  const ratingCount = formatCount(listing.ratingCount);
  const link = (() => {
    const url = new URL(location.href);
    url.hash = `app=${listing.id}`;
    return url.toString();
  })();

  return (
    <div class={`detail-root${closing ? ' is-closing' : ''}`}>
      <div class="detail-backdrop" ref={backdropRef} onClick={onRequestClose} aria-hidden="true" />
      <section
        class="detail"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <div class={`detail__bar${scrolled ? ' is-scrolled' : ''}`}>
          <button
            type="button"
            class="icon-button"
            ref={closeRef}
            onClick={onRequestClose}
            aria-label="Close details"
          >
            <CloseIcon size={18} />
          </button>
          <span class="detail__bar-title" aria-hidden="true">
            {group.name}
          </span>
          <CopyButton value={link} label="Copy link" done="Copied" />
        </div>

        <div class="detail__scroll" ref={scrollRef}>
          <header class="detail__hero">
            <AppIcon
              name={group.name}
              iconUrl={groupIconUrl(group)}
              size={88}
              class="detail__icon"
            />
            <div class="detail__heading">
              <h2 id="detail-title" ref={heroRef}>
                {group.name}
              </h2>
              {developer ? <p class="detail__developer">{developer}</p> : null}
              <div class="detail__tags">
                {collectionLabel ? <span class="tag">{collectionLabel}</span> : null}
                {listing.category ? <span class="tag">{listing.category}</span> : null}
                {local ? <span class="tag tag--local">Only in this browser</span> : null}
              </div>
            </div>
          </header>

          {group.listings.length > 1 ? (
            <SlidingTabs
              class="detail__stores"
              variant="pill"
              role="tablist"
              label={`${group.name} store listings`}
              controls="detail-listing"
              value={listing.id}
              onChange={onSelectListing}
              items={group.listings.map((l) => ({
                value: l.id,
                icon: <span class={`dot dot--${l.platform}`} aria-hidden="true" />,
                label: (
                  <>
                    {storeLabel(l.platform)}
                    <span class="detail__store-version mono">{l.currentVersion ?? 'Varies'}</span>
                  </>
                ),
              }))}
            />
          ) : null}

          <div
            class="detail__listing"
            id="detail-listing"
            role={group.listings.length > 1 ? 'tabpanel' : undefined}
            key={listing.id}
          >
            {listing.checkStatus === 'error' ? (
              <p class="notice notice--error">
                <AlertIcon size={15} />
                <span>
                  The latest {storeLabel(listing.platform)} check failed
                  {listing.checkError ? ` (${listing.checkError})` : ''}. Showing the last good
                  data.
                </span>
              </p>
            ) : null}
            {local ? (
              <p class="notice">
                Watched only in this browser — the scheduled checker doesn’t track it, so it has no
                automatic version history.
              </p>
            ) : null}

            <div class="detail__actions">
              <a
                class={`button button--primary button--store-${listing.platform}`}
                href={listing.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in {storeLabel(listing.platform)} <ExternalIcon size={14} />
              </a>
              <WatchButton
                appName={group.name}
                watched={watched}
                onToggle={onToggleWatch}
                labelled
              />
              {local && listing.platform === 'apple' && onRefreshLocal ? (
                <button
                  type="button"
                  class="button button--ghost"
                  disabled={localRefreshing}
                  onClick={() => onRefreshLocal(listing.id)}
                >
                  <RefreshIcon size={14} /> {localRefreshing ? 'Refreshing…' : 'Refresh info'}
                </button>
              ) : null}
            </div>

            <section class="panel" aria-labelledby="whats-new">
              <div class="panel__head">
                <h3 id="whats-new">
                  What’s new{listing.currentVersion ? ` in ${listing.currentVersion}` : ''}
                </h3>
                {listing.releaseDate ? (
                  <span class="panel__meta">
                    {formatDate(listing.releaseDate)}
                    {releasedAgo ? ` · ${releasedAgo}` : ''}
                  </span>
                ) : null}
              </div>
              {listing.releaseNotes ? (
                <Notes text={listing.releaseNotes} />
              ) : (
                <p class="muted-note">
                  {local
                    ? 'Release notes aren’t available for browser-local watches.'
                    : 'The store didn’t publish release notes for this version.'}
                </p>
              )}
            </section>

            <dl class="facts">
              <Fact label="Version">
                {listing.currentVersion ??
                  (listing.platform === 'google' ? 'Not listed (varies by device)' : 'Unknown')}
              </Fact>
              {listing.previousVersion ? (
                <Fact label="Previous">
                  <span class="facts__transition">
                    {listing.previousVersion} <ArrowRightIcon size={12} /> {listing.currentVersion}
                  </span>
                </Fact>
              ) : null}
              {listing.lastUpdatedAt ? (
                <Fact label="Update detected">{formatDateTime(listing.lastUpdatedAt)}</Fact>
              ) : null}
              {!local && listing.lastCheckedAt ? (
                <Fact label="Last checked">{relativeTime(listing.lastCheckedAt)}</Fact>
              ) : null}
              <Fact label={local ? 'Added here' : 'Tracked since'}>
                {formatDate(
                  local ? (localAddedAt ?? listing.firstTrackedAt) : listing.firstTrackedAt,
                )}
              </Fact>
              {listing.price ? <Fact label="Price">{listing.price}</Fact> : null}
              {typeof listing.rating === 'number' ? (
                <Fact label="Rating">
                  <span class="rating">
                    <span
                      class="rating__stars"
                      style={{ '--rating': listing.rating }}
                      aria-hidden="true"
                    />
                    {listing.rating.toFixed(1)}
                    {ratingCount ? <span class="rating__count"> · {ratingCount}</span> : null}
                  </span>
                </Fact>
              ) : null}
              {listing.contentRating ? (
                <Fact label="Age rating">{listing.contentRating}</Fact>
              ) : null}
              {listing.requiresOs ? <Fact label="Requires">{listing.requiresOs}</Fact> : null}
              {size ? <Fact label="Size">{size}</Fact> : null}
              {listing.bundleId ? (
                <Fact label="Bundle ID">
                  <span class="mono">{listing.bundleId}</span>
                </Fact>
              ) : null}
              <Fact label={listing.platform === 'apple' ? 'App Store ID' : 'Package'}>
                <span class="mono">{listing.storeId}</span>
              </Fact>
              {listing.developerWebsite ? (
                <Fact label="Developer site">
                  <a href={listing.developerWebsite} target="_blank" rel="noopener noreferrer">
                    {safeHost(listing.developerWebsite)} <ExternalIcon size={11} />
                  </a>
                </Fact>
              ) : null}
            </dl>

            {!local ? (
              <section class="panel panel--plain" aria-labelledby="history-title">
                <div class="panel__head">
                  <h3 id="history-title">Version history</h3>
                  <span class="panel__meta">{storeLabel(listing.platform)}</span>
                </div>
                <History history={history} listing={listing} />
              </section>
            ) : (
              <section class="panel" aria-labelledby="tracking-title">
                <div class="panel__head">
                  <h3 id="tracking-title">Want it tracked for everyone?</h3>
                </div>
                <p class="muted-note">
                  Tracked apps get checks every two hours and stored version history. Copy the
                  config entry and open a request — nothing is sent automatically.
                </p>
                <div class="detail__actions">
                  <CopyButton
                    value={configSnippetFor({ ...listing, name: group.name })}
                    label="Copy config entry"
                    done="Copied"
                  />
                  <a
                    class="button button--ghost"
                    href="https://github.com/DawsonCodes/AppWatch/issues/new?template=app_request.yml"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Request tracking <ExternalIcon size={13} />
                  </a>
                </div>
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
