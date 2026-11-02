import { useMemo } from 'preact/hooks';
import type { Cadence } from '../lib/cadence.ts';
import {
  computeCadence,
  describeDays,
  describeRange,
  liveRecordFor,
  MIN_GAPS,
  modelForListing,
  relativeDay,
  trackRecordFor,
} from '../lib/cadence.ts';
import type { ForecastModelFile, Platform, VersionHistoryEntry } from '../shared/types.ts';
import { ForecastBar, GapColumns } from './RhythmCharts.tsx';

const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });

/** "2 in 3", "3 in 5", "7 in 10" — whichever simple fraction is closest. */
export function chanceWords(chance: number): string {
  const options: [number, number][] = [
    [1, 2],
    [3, 5],
    [2, 3],
    [7, 10],
    [3, 4],
    [4, 5],
    [9, 10],
  ];
  let best = options[0]!;
  for (const option of options) {
    if (Math.abs(option[0] / option[1] - chance) < Math.abs(best[0] / best[1] - chance)) {
      best = option;
    }
  }
  return `${best[0]} in ${best[1]}`;
}

function every(days: number): string {
  return describeDays(days).replace(/^about /, '');
}

/** The big line: when the next update is expected. */
function headline(cadence: Cadence, now: Date): { title: string; aside: string | null } {
  switch (cadence.state) {
    case 'insufficient':
      return { title: 'Not enough history yet', aside: null };
    case 'overdue':
      return { title: 'Overdue', aside: null };
    case 'late':
      return { title: 'Later than usual', aside: null };
    default: {
      const next = cadence.next!;
      const day = relativeDay(next.likely, now);
      if (day === 'today') return { title: 'Likely today', aside: null };
      if (day === 'tomorrow') return { title: 'Likely tomorrow', aside: null };
      return { title: `Around ${dayFormat.format(next.likely)}`, aside: day };
    }
  }
}

/** The line under it: the window, or why there isn't one. */
function detail(cadence: Cadence, now: Date): string {
  const count = cadence.releases.length;
  const usual = cadence.typicalDays ? `every ~${every(cadence.typicalDays)}` : null;
  const waited = cadence.last ? relativeDay(cadence.last.time, now) : null;
  switch (cadence.state) {
    case 'insufficient':
      return `${count} update${count === 1 ? '' : 's'} recorded so far. Forecasts start after ${MIN_GAPS + 1}.`;
    case 'overdue':
      return `The last update was ${waited}, longer than any recent gap (usually ${usual}). A new forecast starts with the next update.`;
    case 'late':
      return `The last update was ${waited}; updates usually come ${usual}. If the rhythm holds, likely by ${shortDate.format(cadence.next!.to)} (${chanceWords(cadence.chance)} chance).`;
    default: {
      const next = cadence.next!;
      const chance = `${chanceWords(cadence.chance)} chance`;
      const sameDay = shortDate.format(next.from) === shortDate.format(next.to);
      if (sameDay) return `Expected on ${shortDate.format(next.to)} · ${chance}`;
      if (next.from - now.getTime() < 43_200_000) {
        return `Likely by ${dayFormat.format(next.to)} · ${chance}`;
      }
      return `Likely ${shortDate.format(next.from)} – ${shortDate.format(next.to)} · ${chance}`;
    }
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div class="forecast__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * When the next update is likely, from this listing's recorded releases and
 * the forecast settings AppWatch has learned so far.
 */
export function ForecastCard({
  id,
  entries,
  model,
  platform,
  now,
}: {
  id: string;
  entries: readonly VersionHistoryEntry[];
  model: ForecastModelFile | null;
  /** Sets the color (each platform keeps its own). */
  platform: Platform;
  now: Date;
}) {
  const listingModel = useMemo(() => modelForListing(model, id), [model, id]);
  const cadence = useMemo(
    () => computeCadence(entries, now, listingModel),
    [entries, now, listingModel],
  );
  const record = useMemo(() => trackRecordFor(entries, listingModel), [entries, listingModel]);
  const live = liveRecordFor(model, id);
  const { title, aside } = headline(cadence, now);
  const estimated = cadence.typicalDays !== null;
  const firstRelease = cadence.releases[0];

  return (
    <section
      class={`forecast forecast--${platform}${estimated ? '' : ' forecast--quiet'}`}
      aria-labelledby="forecast-title"
    >
      <div class="forecast__head">
        <h2 class="forecast__eyebrow" id="forecast-title">
          Next update
        </h2>
        {cadence.state === 'late' || cadence.state === 'overdue' ? (
          <span class="forecast__badge">
            {cadence.state === 'late' ? 'Running late' : 'No forecast'}
          </span>
        ) : null}
      </div>
      <p class="forecast__title">
        {title}
        {aside ? <span class="forecast__aside">{aside}</span> : null}
      </p>
      <p class="forecast__detail">{detail(cadence, now)}</p>

      {estimated && cadence.last ? <ForecastBar cadence={cadence} now={now} /> : null}

      {estimated ? (
        <dl class="forecast__facts">
          <Fact
            label="Usual gap"
            value={
              cadence.rangeDays &&
              Math.round(cadence.rangeDays[1]) > Math.round(cadence.rangeDays[0])
                ? describeRange(cadence.rangeDays[0], cadence.rangeDays[1])
                : `~${every(cadence.typicalDays!)}`
            }
          />
          {cadence.weekday ? (
            <Fact label="Usually ships" value={`on ${WEEKDAYS[cadence.weekday.day]}`} />
          ) : null}
          {record ? (
            <Fact label="Past forecasts" value={`${record.hits} of ${record.tests} on time`} />
          ) : (
            <Fact
              label="Last 30 days"
              value={`${cadence.last30} update${cadence.last30 === 1 ? '' : 's'}`}
            />
          )}
        </dl>
      ) : null}

      {estimated ? (
        <details class="forecast__more">
          <summary>How this forecast works</summary>
          <div class="forecast__more-body">
            {cadence.gaps.length >= 2 ? <GapColumns cadence={cadence} /> : null}
            <ul class="forecast__notes">
              {record ? (
                <li>
                  Replayed against its last {record.tests} updates (each forecast made right after
                  the update before it): {record.hits} landed in the window, and the expected day
                  was usually{' '}
                  {record.medianErrorDays < 0.5
                    ? 'right on the day'
                    : `off by about ${every(record.medianErrorDays)}`}
                  .
                </li>
              ) : null}
              {live ? (
                <li>
                  Real forecasts, recorded before the update came: {live.hits} of {live.forecasts}{' '}
                  landed in the window.
                </li>
              ) : null}
              <li>
                Based on {cadence.releases.length} recorded updates
                {firstRelease ? ` since ${monthYear.format(firstRelease.time)}` : ''}. Recent gaps
                count more, the usual release weekdays count, and the time already waited is taken
                into account.
              </li>
              <li>
                AppWatch re-learns its forecasting from every update it records, so these get
                sharper as history grows. Developers don’t publish schedules, so treat it as a
                guide.
              </li>
            </ul>
          </div>
        </details>
      ) : null}
    </section>
  );
}
