import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppGroup, Listing } from '../lib/groups.ts';
import { groupDeveloper, groupIconUrl } from '../lib/groups.ts';
import { formatBytes, formatCount, formatDate, relativeTime } from '../lib/format.ts';
import { configSnippetFor } from '../lib/localApps.ts';
import { appHref } from '../lib/route.ts';
import type { DesktopSource } from '../shared/desktop.ts';
import { desktopSourceFor } from '../shared/desktop.ts';
import type { ForecastModelFile, VersionHistoryEntry } from '../shared/types.ts';
import { historyEntryKey, isDesktopPlatform } from '../shared/types.ts';
import { AppIcon } from './AppIcon.tsx';
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  ExternalIcon,
  RefreshIcon,
} from './Icons.tsx';
import { ForecastCard } from './ForecastCard.tsx';
import { Notes } from './Notes.tsx';
import { storeLabel } from './StoreBadge.tsx';
import { Tabs } from './Tabs.tsx';
import { WatchButton } from './WatchButton.tsx';
import { useDisplayVersion } from '../lib/versionDisplay.ts';

export type HistoryState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; entries: VersionHistoryEntry[]; model: ForecastModelFile | null };

interface AppPageProps {
  group: AppGroup;
  listing: Listing;
  collectionLabel: string | null;
  history: HistoryState;
  watched: boolean;
  /** One "now" per visit, so estimates don't shift while reading. */
  now: Date;
  onSelectListing: (listingId: string) => void;
  onToggleWatch: () => void;
  /** The back link was used; return to the list where it was left. */
  onBack: (event: MouseEvent) => void;
  onRefreshLocal?: (id: string) => void;
  localRefreshing?: boolean;
  localAddedAt?: string | null;
}

const HISTORY_PAGE = 15;

function CopyButton({
  value,
  label,
  iconOnly = false,
}: {
  value: string;
  label: string;
  iconOnly?: boolean;
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

  const text = state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : label;
  if (iconOnly) {
    return (
      <button type="button" class="icon-button icon-button--framed" onClick={copy} title={text}>
        {state === 'copied' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        <span class="visually-hidden" aria-live="polite">
          {text}
        </span>
      </button>
    );
  }
  return (
    <button type="button" class="button" onClick={copy}>
      {state === 'copied' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      <span aria-live="polite">{text}</span>
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

function Loading() {
  return (
    <div class="loading-lines" aria-hidden="true">
      <span class="skeleton skeleton--line" style={{ width: '40%' }} />
      <span class="skeleton skeleton--line" style={{ width: '90%' }} />
      <span class="skeleton skeleton--line" style={{ width: '70%' }} />
    </div>
  );
}

function VersionHistory({ history, listing }: { history: HistoryState; listing: Listing }) {
  const [limit, setLimit] = useState(HISTORY_PAGE);
  if (history.phase === 'loading') return <Loading />;
  if (history.phase === 'error') {
    return (
      <p class="muted">
        <AlertIcon size={14} /> Version history couldn’t be loaded.
      </p>
    );
  }
  const entries = history.entries;
  if (entries.length === 0) {
    return <p class="muted">No versions recorded yet. They’re saved from the first check on.</p>;
  }
  const shown = entries.slice(0, limit);
  const timeOf = (entry: VersionHistoryEntry) => Date.parse(entry.releaseDate ?? entry.detectedAt);
  return (
    <>
      <ol class="versions">
        {shown.map((entry, index) => {
          const older = entries[index + 1];
          const gapDays = older ? (timeOf(entry) - timeOf(older)) / 86_400_000 : null;
          const current =
            index === 0 &&
            (entry.version === listing.currentVersion ||
              (entry.version === null && entry.releaseDate === listing.releaseDate));
          const oldest = index === entries.length - 1;
          return (
            <li class="version" key={historyEntryKey(entry) ?? entry.detectedAt}>
              <div class="version__head">
                {entry.version ? (
                  <span class="version-chip">{entry.version}</span>
                ) : (
                  <span class="version-chip version-chip--none">Update</span>
                )}
                {current ? <span class="tag tag--accent">Current</span> : null}
                {oldest ? <span class="tag">Oldest on record</span> : null}
                <span class="version__date">
                  {entry.releaseDate
                    ? formatDate(entry.releaseDate)
                    : `Found ${formatDate(entry.detectedAt)}`}
                  {gapDays !== null && gapDays >= 1 ? (
                    <span
                      class="version__gap"
                      title={`${Math.round(gapDays)} days after the previous version`}
                    >
                      +{Math.round(gapDays)}d
                    </span>
                  ) : null}
                </span>
              </div>
              {entry.releaseNotes ? <Notes text={entry.releaseNotes} clampAt={220} /> : null}
              {entry.url ? (
                <a class="version__link" href={entry.url} target="_blank" rel="noopener noreferrer">
                  Release notes page <ExternalIcon size={11} />
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
      {entries.length > limit ? (
        <button
          type="button"
          class="button versions__more"
          onClick={() => setLimit((n) => n + HISTORY_PAGE * 2)}
        >
          Show older versions ({entries.length - limit})
        </button>
      ) : null}
    </>
  );
}

/** Where desktop versions come from, in a sentence. */
function desktopNotice(source: DesktopSource): string {
  switch (source.kind) {
    case 'winget':
      return 'From winget, Microsoft’s package catalog. New versions usually appear there within a day or two of release.';
    case 'homebrew':
      return 'From Homebrew, which follows the official download within hours. Homebrew has no release notes.';
    case 'steam':
      return 'From the patch notes the developer posts on Steam. Most games don’t publish version numbers, so updates are listed by date.';
    case 'feed':
      return `From ${source.feed.sourceLabel}. AppWatch doesn’t host installers; get ${source.feed.product} from your school or the official page.`;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * An app's own page: what's new, how often it updates, every recorded
 * version and the store details. Apps on several platforms get a tab per
 * platform.
 */
export function AppPage({
  group,
  listing,
  collectionLabel,
  history,
  watched,
  now,
  onSelectListing,
  onToggleWatch,
  onBack,
  onRefreshLocal,
  localRefreshing = false,
  localAddedAt,
}: AppPageProps) {
  const local = listing.source === 'local';
  const desktop = isDesktopPlatform(listing.platform)
    ? desktopSourceFor(listing.platform, listing.storeId)
    : null;
  const developer = groupDeveloper(group);
  const releasedAgo = relativeTime(listing.releaseDate, now);
  const size = formatBytes(listing.sizeBytes);
  const ratingCount = formatCount(listing.ratingCount);
  const link = new URL(appHref(listing.id), location.href).toString();
  const displayVersion = useDisplayVersion();

  return (
    <article class="app-page" aria-labelledby="app-title">
      <a class="back-link" href="#" onClick={onBack}>
        <ArrowLeftIcon size={16} /> All apps
      </a>

      <header class="app-hero">
        <AppIcon name={group.name} iconUrl={groupIconUrl(group)} size={72} eager />
        <div class="app-hero__text">
          <h1 class="app-hero__name" id="app-title" tabIndex={-1}>
            {group.name}
          </h1>
          <p class="app-hero__dev">
            {[developer, collectionLabel, local ? 'Saved in this browser' : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div class="app-hero__actions">
          <a
            class={`button button--primary button--${listing.platform}`}
            href={listing.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {desktop?.kind === 'steam'
              ? 'Open in Steam'
              : desktop
                ? 'Official site'
                : `Open in ${storeLabel(listing.platform)}`}
            <ExternalIcon size={13} />
          </a>
          <WatchButton appName={group.name} watched={watched} onToggle={onToggleWatch} labelled />
          <CopyButton value={link} label="Copy link to this page" iconOnly />
          {local && listing.platform === 'apple' && onRefreshLocal ? (
            <button
              type="button"
              class="button"
              disabled={localRefreshing}
              onClick={() => onRefreshLocal(listing.id)}
            >
              <RefreshIcon size={14} /> {localRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : null}
        </div>
      </header>

      {group.listings.length > 1 ? (
        <Tabs
          class="platform-tabs"
          variant="pill"
          role="tablist"
          label={`${group.name} platforms`}
          controls="listing-panel"
          value={listing.id}
          onChange={onSelectListing}
          items={group.listings.map((l) => ({
            value: l.id,
            icon: <span class={`dot dot--${l.platform}`} aria-hidden="true" />,
            label: (
              <>
                {storeLabel(l.platform)}
                <span class="platform-tabs__version mono">
                  {l.currentVersion
                    ? displayVersion(l.currentVersion)
                    : l.platform === 'google'
                      ? 'Varies'
                      : '—'}
                </span>
              </>
            ),
          }))}
        />
      ) : null}

      <div
        key={listing.id}
        class="app-page__body"
        id="listing-panel"
        role={group.listings.length > 1 ? 'tabpanel' : undefined}
        aria-label={group.listings.length > 1 ? storeLabel(listing.platform) : undefined}
      >
        <div class="app-page__main">
          {listing.checkStatus === 'error' ? (
            <p class="notice notice--error">
              <AlertIcon size={15} />
              <span>
                The last {storeLabel(listing.platform)} check failed
                {listing.checkError ? ` (${listing.checkError})` : ''}. Showing the last good data.
              </span>
            </p>
          ) : null}
          {local ? (
            <p class="notice">
              Saved in this browser only. It isn’t checked automatically, so there’s no version
              history or forecast.
            </p>
          ) : null}

          {local ? null : history.phase === 'ready' ? (
            <ForecastCard
              id={listing.id}
              entries={history.entries}
              model={history.model}
              platform={listing.platform}
              now={now}
            />
          ) : history.phase === 'loading' ? (
            <section class="forecast" aria-label="Next update">
              <Loading />
            </section>
          ) : null}

          <section class="section" aria-labelledby="whats-new">
            <div class="section__head">
              <h2 class="section__title" id="whats-new">
                What’s new
                {listing.currentVersion ? (
                  <span class="section__version mono">{listing.currentVersion}</span>
                ) : null}
              </h2>
              {listing.releaseDate ? (
                <span class="section__meta">
                  {formatDate(listing.releaseDate)}
                  {releasedAgo ? ` · ${releasedAgo}` : ''}
                </span>
              ) : null}
            </div>
            {listing.releaseNotes ? (
              <Notes text={listing.releaseNotes} clampAt={600} />
            ) : (
              <p class="muted">No release notes for this version.</p>
            )}
            {listing.releaseUrl ? (
              <a
                class="version__link"
                href={listing.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Release notes page <ExternalIcon size={11} />
              </a>
            ) : null}
          </section>

          {local ? (
            <section class="section" aria-labelledby="track-title">
              <h2 class="section__title" id="track-title">
                Track it for everyone
              </h2>
              <p class="muted">
                Tracked apps are checked every two hours and keep their version history. Copy the
                config entry and open a request on GitHub.
              </p>
              <div class="app-actions">
                <CopyButton
                  value={configSnippetFor({
                    name: group.name,
                    storeUrl: listing.storeUrl,
                    platform: listing.platform === 'apple' ? 'apple' : 'google',
                  })}
                  label="Copy config entry"
                />
                <a
                  class="button"
                  href="https://github.com/DawsonCodes/AppWatch/issues/new?template=app_request.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Request tracking <ExternalIcon size={13} />
                </a>
              </div>
            </section>
          ) : (
            <section class="section" aria-labelledby="history-title">
              <div class="section__head">
                <h2 class="section__title" id="history-title">
                  Version history
                </h2>
                {history.phase === 'ready' && history.entries.length > 0 ? (
                  <span class="section__meta">
                    {history.entries.length} version{history.entries.length === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <VersionHistory key={listing.id} history={history} listing={listing} />
            </section>
          )}
        </div>

        <aside class="app-page__side" aria-labelledby="details-title">
          <section class="section">
            <h2 class="section__title" id="details-title">
              Details
            </h2>
            <dl class="facts">
              <Fact label="Version">
                <span class="mono">
                  {listing.currentVersion ??
                    (listing.platform === 'google'
                      ? 'Varies by device'
                      : desktop?.kind === 'steam'
                        ? 'Not published'
                        : 'Unknown')}
                </span>
              </Fact>
              {listing.previousVersion ? (
                <Fact label="Before that">
                  <span class="mono">{listing.previousVersion}</span>
                </Fact>
              ) : null}
              {listing.releaseDate ? (
                <Fact label="Released">{formatDate(listing.releaseDate)}</Fact>
              ) : null}
              {!local && listing.lastCheckedAt ? (
                <Fact label="Last checked">{relativeTime(listing.lastCheckedAt, now)}</Fact>
              ) : null}
              <Fact label={local ? 'Added' : 'Tracked since'}>
                {formatDate(
                  local ? (localAddedAt ?? listing.firstTrackedAt) : listing.firstTrackedAt,
                )}
              </Fact>
              {listing.category ? <Fact label="Category">{listing.category}</Fact> : null}
              {listing.price ? <Fact label="Price">{listing.price}</Fact> : null}
              {typeof listing.rating === 'number' ? (
                <Fact label="Rating">
                  {listing.rating.toFixed(1)} / 5{ratingCount ? ` (${ratingCount})` : ''}
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
              {desktop ? (
                desktop.kind === 'feed' ? null : (
                  <Fact
                    label={
                      desktop.kind === 'winget'
                        ? 'winget ID'
                        : desktop.kind === 'steam'
                          ? 'Steam app ID'
                          : 'Homebrew cask'
                    }
                  >
                    <span class="mono">
                      {desktop.kind === 'winget'
                        ? desktop.packageId
                        : desktop.kind === 'steam'
                          ? desktop.appId
                          : desktop.token}
                    </span>
                  </Fact>
                )
              ) : (
                <Fact label={listing.platform === 'apple' ? 'App Store ID' : 'Package'}>
                  <span class="mono">{listing.storeId}</span>
                </Fact>
              )}
              {listing.developerWebsite ? (
                <Fact label="Website">
                  <a href={listing.developerWebsite} target="_blank" rel="noopener noreferrer">
                    {safeHost(listing.developerWebsite)} <ExternalIcon size={11} />
                  </a>
                </Fact>
              ) : null}
            </dl>
            {desktop ? (
              <p class="facts__source">
                {desktopNotice(desktop)}{' '}
                <a href={desktop.sourceUrl} target="_blank" rel="noopener noreferrer">
                  View source <ExternalIcon size={11} />
                </a>
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </article>
  );
}
