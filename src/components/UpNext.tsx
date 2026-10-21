import type { Cadence } from '../lib/cadence.ts';
import { relativeDay } from '../lib/cadence.ts';
import type { AppGroup, Listing } from '../lib/groups.ts';
import { groupIconUrl } from '../lib/groups.ts';
import { AppIcon } from './AppIcon.tsx';
import { storeLabel } from './StoreBadge.tsx';

export interface UpNextItem {
  group: AppGroup;
  listing: Listing;
  cadence: Cadence;
}

function when(cadence: Cadence, now: Date): string {
  if (cadence.state === 'due') return 'due now';
  if (!cadence.next) return '';
  const day = relativeDay(cadence.next.likely, now);
  return day === 'today' || day === 'tomorrow' ? `likely ${day}` : day.replace(/^in /, 'in ~');
}

/** The apps most likely to ship an update next, from their release rhythm. */
export function UpNext({
  items,
  onOpen,
  now = new Date(),
}: {
  items: readonly UpNextItem[];
  onOpen: (listingId: string, trigger: HTMLElement) => void;
  now?: Date;
}) {
  if (items.length === 0) return null;
  return (
    <section class="upnext" aria-labelledby="upnext-title">
      <h2 class="upnext__title" id="upnext-title">
        Up next <span class="upnext__hint">expected from each app’s release rhythm</span>
      </h2>
      <ul class="upnext__list">
        {items.map(({ group, listing, cadence }) => (
          <li key={listing.id}>
            <button
              type="button"
              class="upnext__item"
              onClick={(event) => onOpen(listing.id, event.currentTarget)}
            >
              <AppIcon name={group.name} iconUrl={groupIconUrl(group)} size={32} />
              <span class="upnext__text">
                <span class="upnext__name">{group.name}</span>
                <span class="upnext__when">
                  <span class={`dot dot--${listing.platform}`} aria-hidden="true" />
                  {storeLabel(listing.platform)} · {when(cadence, now)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
