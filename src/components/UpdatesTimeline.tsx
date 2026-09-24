import { useMemo, useState } from 'preact/hooks';
import type { TimelineEvent } from '../lib/timeline.ts';
import { groupByDay } from '../lib/timeline.ts';
import { groupIconUrl } from '../lib/groups.ts';
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
  onOpen: (listingId: string, trigger: HTMLElement) => void;
  onClearFilters: () => void;
  filtered: boolean;
}

/**
 * Every recorded release, newest first, grouped by day. Built from the stored
 * version history, so it only contains releases AppWatch actually saw: the
 * version each listing had when tracking began, plus every change since.
 */
export function UpdatesTimeline({
  events,
  onOpen,
  onClearFilters,
  filtered,
}: UpdatesTimelineProps) {
  const [limit, setLimit] = useState(PAGE);
  const days = useMemo(() => groupByDay(events.slice(0, limit)), [events, limit]);

  if (events.length === 0) {
    return (
      <div class="empty-state empty-state--compact">
        <h2>No releases here yet</h2>
        <p>
          {filtered
            ? 'Nothing in the recorded history matches these filters.'
            : 'Releases appear here as the scheduled checker records them.'}
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
            <span>{day.label}</span>
            <span class="timeline__count">
              {day.events.length} release{day.events.length === 1 ? '' : 's'}
            </span>
          </h2>
          <ol class="timeline__list">
            {day.events.map((event) => {
              const at = timeOfDay(event.releaseDate);
              return (
                <li class="timeline__item" key={event.id}>
                  <span
                    class={`timeline__node timeline__node--${event.listing.platform}`}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="release"
                    onClick={(e) => onOpen(event.listing.id, e.currentTarget)}
                  >
                    <AppIcon
                      name={event.group.name}
                      iconUrl={event.listing.iconUrl ?? groupIconUrl(event.group)}
                      size={44}
                      class="release__icon"
                    />
                    <span class="release__body">
                      <span class="release__top">
                        <span class="release__name">{event.group.name}</span>
                        <StoreBadge platform={event.listing.platform} compact />
                        {at ? <span class="release__time">{at}</span> : null}
                      </span>
                      <span class="release__versions">
                        {event.previousVersion && event.version ? (
                          <>
                            <span class="mono release__old">{event.previousVersion}</span>
                            <ArrowRightIcon size={12} class="release__arrow" />
                          </>
                        ) : null}
                        {event.version ? (
                          <span class="version-chip">{event.version}</span>
                        ) : (
                          <span class="version-chip version-chip--soft">New store release</span>
                        )}
                        {event.firstRecorded ? (
                          <span class="release__first">first recorded</span>
                        ) : null}
                      </span>
                      {event.releaseNotes ? (
                        <span class="release__notes">{truncate(event.releaseNotes, 220)}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {events.length > limit ? (
        <div class="timeline__more">
          <button type="button" class="button" onClick={() => setLimit((n) => n + PAGE)}>
            Show older releases
            <span class="timeline__remaining">{events.length - limit} more</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
