import { memo } from 'preact/compat';
import type { AppGroup } from '../lib/groups.ts';
import { groupDeveloper, groupIconUrl, primaryListing } from '../lib/groups.ts';
import { isRecentlyUpdated } from '../lib/filtering.ts';
import { compactAgo, formatDate, formatDateTime } from '../lib/format.ts';
import { groupHref } from '../lib/route.ts';
import { useDisplayVersion } from '../lib/versionDisplay.ts';
import { AppIcon } from './AppIcon.tsx';
import { AlertIcon } from './Icons.tsx';
import { storeLabel } from './StoreBadge.tsx';
import { WatchButton } from './WatchButton.tsx';

interface AppCardProps {
  group: AppGroup;
  watched: boolean;
  /** A short extra line (e.g. the next expected update when sorting by it). */
  hint?: string;
  onToggleWatch: (group: AppGroup) => void;
}

/**
 * One app across all its platforms. The whole card is a link to the app's
 * page; the star toggles the watchlist without opening it.
 */
function AppCardImpl({ group, watched, hint, onToggleWatch }: AppCardProps) {
  const primary = primaryListing(group);
  const developer = groupDeveloper(group);
  const local = group.source === 'local';
  const displayVersion = useDisplayVersion();

  return (
    <article class="card" data-key={group.key}>
      <div class="card__head">
        <AppIcon name={group.name} iconUrl={groupIconUrl(group)} size={48} />
        <div class="card__title">
          <h3 class="card__name">
            <a class="card__link" href={groupHref(group, primary.id)}>
              {group.name}
            </a>
          </h3>
          <p class="card__dev">{local ? 'Saved in this browser' : (developer ?? ' ')}</p>
        </div>
        <WatchButton appName={group.name} watched={watched} onToggle={() => onToggleWatch(group)} />
      </div>

      <ul class="card__stores">
        {group.listings.map((listing) => {
          const fresh = isRecentlyUpdated(listing);
          return (
            <li class="store-row" key={listing.id}>
              <span class="store-row__store">
                <span class={`dot dot--${listing.platform}`} aria-hidden="true" />
                {storeLabel(listing.platform)}
              </span>
              <span class="store-row__version mono" title={listing.currentVersion ?? undefined}>
                {(listing.currentVersion && displayVersion(listing.currentVersion)) ?? (
                  <span class="store-row__varies" title="This store doesn't list one version">
                    {listing.platform === 'google' && !local ? 'Varies' : '—'}
                  </span>
                )}
              </span>
              {listing.checkStatus === 'error' ? (
                <span
                  class="store-row__alert"
                  title={`Last check failed: ${listing.checkError ?? 'unknown error'}`}
                >
                  <AlertIcon size={13} />
                  <span class="visually-hidden">Last check failed</span>
                </span>
              ) : null}
              <span
                class={`store-row__when${fresh ? ' is-fresh' : ''}`}
                title={
                  listing.releaseDate
                    ? `Released ${formatDateTime(listing.releaseDate) ?? formatDate(listing.releaseDate)}`
                    : undefined
                }
              >
                {fresh ? <span class="visually-hidden">New this week, </span> : null}
                {compactAgo(listing.releaseDate) ?? ''}
              </span>
            </li>
          );
        })}
      </ul>

      {hint ? <p class="card__hint">{hint}</p> : null}
    </article>
  );
}

export const AppCard = memo(AppCardImpl);
