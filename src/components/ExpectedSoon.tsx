import type { Cadence } from '../lib/cadence.ts';
import { relativeDay } from '../lib/cadence.ts';
import type { AppGroup, Listing } from '../lib/groups.ts';
import { groupIconUrl } from '../lib/groups.ts';
import { appHref } from '../lib/route.ts';
import { AppIcon } from './AppIcon.tsx';
import { storeLabel } from './StoreBadge.tsx';

export interface ExpectedItem {
  group: AppGroup;
  listing: Listing;
  cadence: Cadence;
}

function when(cadence: Cadence, now: Date): string {
  if (cadence.state === 'due') return 'Due now';
  if (!cadence.next) return '';
  const day = relativeDay(cadence.next.likely, now);
  if (day === 'today') return 'Likely today';
  if (day === 'tomorrow') return 'Likely tomorrow';
  return day.replace(/^in /, 'In ~');
}

/** Apps most likely to update next, based on how often each one updates. */
export function ExpectedSoon({ items, now }: { items: readonly ExpectedItem[]; now: Date }) {
  if (items.length === 0) return null;
  return (
    <section class="expected" aria-labelledby="expected-title">
      <h2 class="expected__title" id="expected-title">
        Expected soon
      </h2>
      <ul class="expected__list">
        {items.map(({ group, listing, cadence }) => (
          <li key={listing.id}>
            <a class="expected__item" href={appHref(listing.id)}>
              <AppIcon name={group.name} iconUrl={groupIconUrl(group)} size={32} />
              <span class="expected__text">
                <span class="expected__name">{group.name}</span>
                <span class="expected__when">
                  {when(cadence, now)} · {storeLabel(listing.platform)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
