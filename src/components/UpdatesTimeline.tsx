import { useMemo, useState } from 'preact/hooks';
import type { TimelineEvent } from '../lib/timeline.ts';
import { groupByDay } from '../lib/timeline.ts';
import { groupIconUrl } from '../lib/groups.ts';
import { appHref } from '../lib/route.ts';
import { truncate } from '../shared/text.ts';
import { AppIcon } from './AppIcon.tsx';
import { ArrowRightIcon } from './Icons.tsx';
import { StoreBadge } from './StoreBadge.tsx';

const PAGE = 60;

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** Time of day, only when the store gave one (Play dates are often day-only). */
function timeOfDay(iso: string | null): string | null {
  if (!iso || /T00:00:00(?:\.000)?Z$/.test(iso) || !iso.includes('T')) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : timeFormat.format(time);
}

interface UpdatesTimelineProps {
  events: readonly TimelineEvent[];
  onClearFilters: () => void;
  filtered: boolean;
}

/**
 * Every recorded update, newest first, grouped by day. Built from the saved
 * version history, so it only lists releases AppWatch actually saw.
 */
export function UpdatesTimeline({ events, onClearFilters, filtered }: UpdatesTimelineProps) {
  const [limit, setLimit] = useState(PAGE);
  const days = useMemo(() => groupByDay(events.slice(0, limit)), [events, limit]);

  if (events.length === 0) {
    return (
      <div class="empty">
        <h2>No updates here yet</h2>
        <p>
          {filtered
            ? 'No recorded updates match these filters.'
            : 'Updates show up here as the checker records them.'}
        </p>
        {filtered ? (
          <button type="button" class="button" onClick={onClearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div class="timeline">
      {days.map((day) => (
        <section class="timeline__day" key={day.key} aria-labelledby={`day-${day.key}`}>
          <h2 class="timeline__date" id={`day-${day.key}`}>
            {day.label}
            <span class="timeline__count">
              {day.events.length} update{day.events.length === 1 ? '' : 's'}
            </span>
          </h2>
          <ol class="timeline__list">
            {day.events.map((event) => {
              const at = timeOfDay(event.releaseDate);
              return (
                <li key={event.id}>
                  <a class="release" href={appHref(event.listing.id)}>
                    <AppIcon
                      name={event.group.name}
                      iconUrl={groupIconUrl(event.group)}
                      size={40}
                    />
                    <span class="release__body">
                      <span class="release__top">
                        <span class="release__name">{event.group.name}</span>
                        <StoreBadge platform={event.listing.platform} />
                        {at ? <span class="release__time">{at}</span> : null}
                      </span>
                      <span class="release__versions">
                        {event.previousVersion && event.version ? (
                          <>
                            <span class="mono release__old">{event.previousVersion}</span>
                            <ArrowRightIcon size={12} />
                          </>
                        ) : null}
                        {event.version ? (
                          <span class="version-chip">{event.version}</span>
                        ) : (
                          <span class="version-chip version-chip--none">Update</span>
                        )}
                        {event.firstRecorded ? (
                          <span class="release__first">first recorded</span>
                        ) : null}
                      </span>
                      {event.releaseNotes ? (
                        <span class="release__notes">{truncate(event.releaseNotes, 200)}</span>
                      ) : null}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {events.length > limit ? (
        <div class="timeline__more">
          <button type="button" class="button" onClick={() => setLimit((n) => n + PAGE)}>
            Show older updates ({events.length - limit})
          </button>
        </div>
      ) : null}
    </div>
  );
}
