import { useMemo } from 'preact/hooks';
import type { Cadence, CadenceAccuracy } from '../lib/cadence.ts';
import {
  backtestCadence,
  computeCadence,
  describeDays,
  describeRange,
  MIN_GAPS,
  relativeDay,
} from '../lib/cadence.ts';
import type { Platform, VersionHistoryEntry } from '../shared/types.ts';
import { GapColumns, ReleaseStrip } from './RhythmCharts.tsx';

const DAY = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CONFIDENCE_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function every(cadence: Cadence): string {
  return describeDays(cadence.typicalDays ?? 0).replace(/^about /, '');
}

function summary(cadence: Cadence, now: Date): string {
  if (cadence.state === 'insufficient' || !cadence.next || !cadence.rangeDays) {
    const count = cadence.releases.length;
    return `Not enough updates yet to estimate. ${count} recorded so far; estimates start at ${MIN_GAPS + 1}.`;
  }
  const [low, high] = cadence.rangeDays;
  const range =
    Math.round(high) > Math.round(low) ? ` (usually ${describeRange(low, high)} apart)` : '';
  const day = cadence.weekday ? `, most often on ${WEEKDAYS[cadence.weekday.day]}s` : '';
  const base = `Updates about every ${every(cadence)}${range}${day}.`;
  switch (cadence.state) {
    case 'upcoming':
      return `${base} Next update expected around ${dayFormat.format(cadence.next.likely)} (${relativeDay(cadence.next.likely, now)}).`;
    case 'due':
      return `${base} An update is due now.`;
    case 'overdue':
      return `${base} The last one was ${relativeDay(cadence.last!.time, now)}, so the next is overdue.`;
  }
}

function nextValue(cadence: Cadence, now: Date): string {
  if (cadence.state === 'insufficient' || !cadence.next) return '—';
  if (cadence.state === 'due') return 'Due now';
  if (cadence.state === 'overdue') return 'Overdue';
  return relativeDay(cadence.next.likely, now).replace(/^in /, '~');
}

/** Accuracy so far, in a sentence. */
function accuracyLine(accuracy: CadenceAccuracy): string {
  const off =
    accuracy.medianErrorDays < 0.5
      ? 'usually on the right day'
      : `usually off by about ${describeDays(accuracy.medianErrorDays).replace(/^about /, '')}`;
  return `Checked against its last ${accuracy.tests} updates: ${accuracy.hits} landed in the expected window, and the likely day was ${off}.`;
}

/** Confidence from how the estimate has actually done, when there's enough to judge. */
function confidenceOf(cadence: Cadence, accuracy: CadenceAccuracy | null): Cadence['confidence'] {
  if (!accuracy || accuracy.tests < 5) return cadence.confidence;
  const rate = accuracy.hits / accuracy.tests;
  return rate >= 0.6 ? 'high' : rate >= 0.4 ? 'medium' : 'low';
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div class="stat">
      <dt class="stat__label">{label}</dt>
      <dd class="stat__value">{value}</dd>
      {detail ? <dd class="stat__detail">{detail}</dd> : null}
    </div>
  );
}

/**
 * How often this listing updates and when the next update is likely, worked
 * out from the release dates AppWatch has recorded.
 */
export function UpdatePattern({
  entries,
  platform,
  now,
}: {
  entries: readonly VersionHistoryEntry[];
  /** Sets the chart color (each platform keeps its own color). */
  platform: Platform;
  now: Date;
}) {
  const cadence = useMemo(() => computeCadence(entries, now), [entries, now]);
  const accuracy = useMemo(() => backtestCadence(entries), [entries]);
  const estimated = cadence.state !== 'insufficient' && cadence.next !== null;
  const confidence = estimated ? confidenceOf(cadence, accuracy) : null;
  const newestFirst = useMemo(() => [...cadence.releases].reverse(), [cadence]);

  return (
    <section class={`section pattern pattern--${platform}`} aria-labelledby="pattern-title">
      <div class="section__head">
        <h2 class="section__title" id="pattern-title">
          Update pattern
        </h2>
        {confidence ? (
          <span class="section__meta">{CONFIDENCE_LABEL[confidence]} confidence</span>
        ) : null}
      </div>
      <p class="pattern__summary">{summary(cadence, now)}</p>

      <dl class="stats stats--six">
        <Stat
          label="Usual gap"
          value={estimated ? `~${every(cadence)}` : '—'}
          detail={
            estimated &&
            cadence.rangeDays &&
            Math.round(cadence.rangeDays[1]) > Math.round(cadence.rangeDays[0])
              ? `usually ${describeRange(cadence.rangeDays[0], cadence.rangeDays[1])}`
              : undefined
          }
        />
        <Stat
          label="Next update"
          value={nextValue(cadence, now)}
          detail={
            estimated && cadence.next && cadence.state === 'upcoming'
              ? `likely ${dayFormat.format(cadence.next.likely)}`
              : undefined
          }
        />
        <Stat
          label="Expected window"
          value={
            estimated && cadence.next
              ? `${shortDate.format(cadence.next.from)} – ${shortDate.format(cadence.next.to)}`
              : '—'
          }
          detail={estimated ? 'where half of past gaps fall' : undefined}
        />
        <Stat
          label="Past accuracy"
          value={accuracy ? `${accuracy.hits} of ${accuracy.tests}` : '—'}
          detail={accuracy ? 'landed in the window' : 'needs more history'}
        />
        <Stat label="Last 30 days" value={String(cadence.last30)} detail="updates" />
        <Stat
          label="Last update"
          value={cadence.last ? relativeDay(cadence.last.time, now) : '—'}
          detail={cadence.last?.version ?? undefined}
        />
      </dl>
      {estimated && accuracy ? <p class="pattern__accuracy">{accuracyLine(accuracy)}</p> : null}

      {cadence.releases.length >= 2 ? (
        <div class="pattern__charts">
          <ReleaseStrip cadence={cadence} now={now} />
          {cadence.gaps.length >= 2 ? <GapColumns cadence={cadence} /> : null}
        </div>
      ) : null}

      {newestFirst.length > 0 ? (
        <details class="pattern__table">
          <summary>All release dates ({newestFirst.length})</summary>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Released</th>
                  <th scope="col" class="num">
                    Days after previous
                  </th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((release, i) => {
                  const older = newestFirst[i + 1];
                  return (
                    <tr key={`${release.time}-${i}`}>
                      <td class="mono">{release.version ?? 'No version number'}</td>
                      <td>{longDate.format(release.time)}</td>
                      <td class="num">
                        {older ? Math.round(((release.time - older.time) / DAY) * 10) / 10 : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <p class="section__foot">
        Estimated from past release dates, with recent updates counting more and a lean toward the
        days this app usually ships on. Developers don’t publish their schedules, so treat this as a
        guide.
      </p>
    </section>
  );
}
