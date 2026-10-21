import { useMemo, useState } from 'preact/hooks';
import type { Cadence } from '../lib/cadence.ts';
import {
  computeCadence,
  describeDays,
  describeRange,
  MIN_GAPS,
  relativeDay,
} from '../lib/cadence.ts';
import { readPref, writePref } from '../lib/prefs.ts';
import type { Platform, VersionHistoryEntry } from '../shared/types.ts';
import { ChevronDownIcon } from './Icons.tsx';
import { GapColumns, ReleaseStrip } from './RhythmCharts.tsx';

const ADVANCED_PREF = 'appwatch:rhythm-charts:v1';
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
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function summary(cadence: Cadence, now: Date): string {
  if (
    cadence.state === 'insufficient' ||
    !cadence.next ||
    !cadence.typicalDays ||
    !cadence.rangeDays
  ) {
    const count = cadence.releases.length;
    return `Not enough history to predict yet — ${count} release${count === 1 ? '' : 's'} recorded. Predictions start after ${MIN_GAPS + 1}.`;
  }
  const every = describeDays(cadence.typicalDays).replace(/^about /, '');
  const [low, high] = cadence.rangeDays;
  const range = Math.round(high) > Math.round(low) ? ` (usually ${describeRange(low, high)})` : '';
  const window = `${shortDate.format(cadence.next.from)} – ${shortDate.format(cadence.next.to)}`;
  switch (cadence.state) {
    case 'upcoming':
      return `Updates about every ${every}${range}. The next one is most likely around ${dayFormat.format(cadence.next.likely)} (${relativeDay(cadence.next.likely, now)}), between ${window}.`;
    case 'due':
      return `Updates about every ${every}${range}, and it's inside its usual window right now (${window}).`;
    case 'overdue':
      return `Updates about every ${every}${range}, but the last one was ${relativeDay(cadence.last!.time, now)} — later than usual.`;
  }
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div class="tile">
      <span class="tile__label">{label}</span>
      <span class="tile__value">{value}</span>
      {detail ? <span class="tile__detail">{detail}</span> : null}
    </div>
  );
}

/**
 * How often this listing updates and when it most likely will next, from its
 * recorded release history. Charts and a table sit behind a toggle for
 * readers who want the detail; the choice is remembered.
 */
export function RhythmPanel({
  entries,
  platform,
  now = new Date(),
}: {
  entries: readonly VersionHistoryEntry[];
  platform: Platform;
  now?: Date;
}) {
  const cadence = useMemo(() => computeCadence(entries, now), [entries, now]);
  const [advanced, setAdvanced] = useState(() => readPref(ADVANCED_PREF) === '1');
  const toggle = () =>
    setAdvanced((open) => {
      writePref(ADVANCED_PREF, open ? '0' : '1');
      return !open;
    });

  const predicted = cadence.state !== 'insufficient' && cadence.next && cadence.typicalDays;
  const newestFirst = [...cadence.releases].reverse();

  return (
    <section class={`panel rhythm rhythm--${platform}`} aria-labelledby="rhythm-title">
      <div class="panel__head">
        <h3 id="rhythm-title">Release rhythm</h3>
        {cadence.confidence ? (
          <span class="panel__meta">
            {cadence.confidence} confidence · {cadence.sample} gaps
          </span>
        ) : null}
      </div>
      <p class="rhythm__summary">{summary(cadence, now)}</p>

      <div class="tiles">
        <Tile
          label="Typical gap"
          value={predicted ? describeDays(cadence.typicalDays!).replace(/^about /, '~') : '—'}
          detail={cadence.weekday ? `often on ${WEEKDAYS[cadence.weekday.day]}` : undefined}
        />
        <Tile
          label="Next update"
          value={
            predicted
              ? cadence.state === 'overdue'
                ? 'Overdue'
                : cadence.state === 'due'
                  ? 'Due now'
                  : relativeDay(cadence.next!.likely, now).replace(/^in /, '~')
              : '—'
          }
          detail={predicted ? `likely ${shortDate.format(cadence.next!.likely)}` : undefined}
        />
        <Tile label="Last 30 days" value={String(cadence.last30)} detail="releases" />
        <Tile
          label="Last update"
          value={cadence.last ? relativeDay(cadence.last.time, now) : '—'}
          detail={cadence.last?.version ?? undefined}
        />
      </div>

      {cadence.releases.length >= 2 ? (
        <button
          type="button"
          class={`rhythm__toggle${advanced ? ' is-open' : ''}`}
          aria-expanded={advanced}
          onClick={toggle}
        >
          <ChevronDownIcon size={14} />
          {advanced ? 'Hide charts' : 'Show charts & data'}
        </button>
      ) : null}

      {advanced && cadence.releases.length >= 2 ? (
        <div class="rhythm__charts">
          <ReleaseStrip cadence={cadence} now={now} />
          {cadence.gaps.length >= 2 ? <GapColumns cadence={cadence} /> : null}
          <details class="rhythm__table">
            <summary>Show as a table</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Released</th>
                  <th scope="col">Days since previous</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((release, i) => {
                  const older = newestFirst[i + 1];
                  return (
                    <tr key={`${release.time}-${i}`}>
                      <td class="mono">{release.version ?? 'Store release'}</td>
                      <td>{longDate.format(release.time)}</td>
                      <td class="num">
                        {older
                          ? Math.round(((release.time - older.time) / 86_400_000) * 10) / 10
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </div>
      ) : null}

      <p class="rhythm__foot">
        Estimated from the gaps between past releases — apps don’t publish their schedules.
      </p>
    </section>
  );
}
