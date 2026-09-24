import { memo } from 'preact/compat';
import type { AppGroup } from '../lib/groups.ts';
import { groupDeveloper, groupIconUrl, primaryListing } from '../lib/groups.ts';
import { isRecentlyUpdated } from '../lib/filtering.ts';
import { compactAgo, formatDate } from '../lib/format.ts';
import { truncate } from '../shared/text.ts';
import { AppIcon } from './AppIcon.tsx';
import { AlertIcon } from './Icons.tsx';
import { storeLabel } from './StoreBadge.tsx';
import { WatchButton } from './WatchButton.tsx';

interface AppCardProps {
  group: AppGroup;
  watched: boolean;
  open: boolean;
  index: number;
  onToggleWatch: (group: AppGroup) => void;
  onOpen: (listingId: string, trigger: HTMLElement) => void;
}

/**
 * One app, across both stores. States are deliberately distinct: hover lifts
 * the card, keyboard focus rings the whole card, "New" marks a store row that
 * updated this week, a filled star means watched, and the open card keeps an
 * accent outline while its detail panel is showing.
 */
function AppCardImpl({ group, watched, open, index, onToggleWatch, onOpen }: AppCardProps) {
  const primary = primaryListing(group);
  const developer = groupDeveloper(group);
  const notes = primary.releaseNotes ? truncate(primary.releaseNotes, 140) : null;
  const recent = group.listings.some((listing) => isRecentlyUpdated(listing));
  const local = group.source === 'local';

  const classes = ['card'];
  if (recent) classes.push('card--fresh');
  if (open) classes.push('card--open');

  return (
    <article
      class={classes.join(' ')}
      data-group={group.key}
      style={{ '--vt-name': `card-${group.key}`, '--i': Math.min(index, 16) }}
    >
      <button
        type="button"
        class="card__open"
        aria-label={`${group.name}: show details`}
        onClick={(event) => onOpen(primary.id, event.currentTarget)}
      />
      <header class="card__head">
        <AppIcon name={group.name} iconUrl={groupIconUrl(group)} size={52} class="card__icon" />
        <div class="card__title">
          <h3 class="card__name">{group.name}</h3>
          <p class="card__dev">{local ? 'Watched in this browser' : (developer ?? ' ')}</p>
        </div>
        <WatchButton appName={group.name} watched={watched} onToggle={() => onToggleWatch(group)} />
      </header>

      <ul class="card__stores">
        {group.listings.map((listing) => {
          const fresh = isRecentlyUpdated(listing);
          const when = compactAgo(listing.releaseDate);
          return (
            <li
              class={`store-row store-row--${listing.platform}${fresh ? ' store-row--fresh' : ''}`}
              key={listing.id}
            >
              <span class="store-row__store">
                <span class="store-row__dot" aria-hidden="true" />
                {storeLabel(listing.platform)}
              </span>
              <span class="store-row__version">
                {listing.currentVersion ? (
                  <span class="mono store-row__number" title={listing.currentVersion}>
                    {listing.currentVersion}
                  </span>
                ) : (
                  <span class="store-row__varies" title="The store lists no single version">
                    {listing.source === 'local' ? '—' : 'Varies'}
                  </span>
                )}
                {listing.checkStatus === 'error' ? (
                  <span
                    class="store-row__alert"
                    title={`Last check failed: ${listing.checkError ?? 'unknown error'}`}
                  >
                    <AlertIcon size={13} />
                    <span class="visually-hidden">Last check failed</span>
                  </span>
                ) : null}
              </span>
              <span
                class="store-row__when"
                title={
                  listing.releaseDate ? `Released ${formatDate(listing.releaseDate)}` : undefined
                }
              >
                {fresh ? <span class="visually-hidden">New this week, </span> : null}
                {when ?? ''}
              </span>
            </li>
          );
        })}
      </ul>

      {notes ? <p class="card__notes">{notes}</p> : null}
    </article>
  );
}

export const AppCard = memo(AppCardImpl);
