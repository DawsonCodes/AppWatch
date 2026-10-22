import { memo } from 'preact/compat';
import type { AppGroup } from '../lib/groups.ts';
import { groupDeveloper, groupIconUrl, primaryListing } from '../lib/groups.ts';
import { isRecentlyUpdated } from '../lib/filtering.ts';
import { compactAgo, formatDate } from '../lib/format.ts';
import { appHref } from '../lib/route.ts';
import { AppIcon } from './AppIcon.tsx';
import { AlertIcon } from './Icons.tsx';
import { storeLabel } from './StoreBadge.tsx';
import { WatchButton } from './WatchButton.tsx';

interface AppCardProps {
  group: AppGroup;
  watched: boolean;
  /**
   * How often it updates ("Updates every ~6 days · next in ~3 days"); null
   * when there isn't enough history, undefined while history is loading.
   */
  rhythm?: string | null;
  onToggleWatch: (group: AppGroup) => void;
}

/**
 * One app across all its platforms. The whole card is a link to the app's
 * page; the star toggles the watchlist without opening it.
 */
function AppCardImpl({ group, watched, rhythm, onToggleWatch }: AppCardProps) {
  const primary = primaryListing(group);
  const developer = groupDeveloper(group);
  const local = group.source === 'local';

  return (
    <article class="card" data-key={group.key}>
      <div class="card__head">
        <AppIcon name={group.name} iconUrl={groupIconUrl(group)} size={48} />
        <div class="card__title">
          <h3 class="card__name">
            <a class="card__link" href={appHref(primary.id)}>
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
                {listing.currentVersion ?? (
                  <span class="store-row__varies" title="This store doesn't list one version">
                    {local ? '—' : 'Varies'}
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
                  listing.releaseDate ? `Released ${formatDate(listing.releaseDate)}` : undefined
                }
              >
                {fresh ? <span class="visually-hidden">New this week, </span> : null}
                {compactAgo(listing.releaseDate) ?? ''}
              </span>
            </li>
          );
        })}
      </ul>

      {local ? null : (
        <p class={`card__rhythm${rhythm ? '' : ' card__rhythm--none'}`}>
          {rhythm === undefined ? ' ' : (rhythm ?? 'Not enough updates yet to estimate')}
        </p>
      )}
    </article>
  );
}

export const AppCard = memo(AppCardImpl);
