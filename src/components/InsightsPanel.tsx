import type { AppRecord, StatusFile } from '../shared/types.ts';
import { isRecentlyUpdated, RECENT_DAYS } from '../lib/filtering.ts';
import { formatDateTime, relativeTime } from '../lib/format.ts';
import { ChevronDownIcon } from './Icons.tsx';

interface InsightsPanelProps {
  /** Every tracked listing the checker has resolved. */
  listings: readonly AppRecord[];
  /** Configured listings the checker has never resolved (no card is shown for them). */
  unresolved: readonly AppRecord[];
  appCount: number;
  localCount: number;
  status: StatusFile | null;
  open: boolean;
  onToggle: () => void;
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div class="insights__stat">
      <dt>{label}</dt>
      <dd>
        <span class="insights__value">{value}</span>
        {detail ? <span class="insights__detail">{detail}</span> : null}
      </dd>
    </div>
  );
}

/** Quiet, collapsible tracking stats. The open/closed choice persists locally. */
export function InsightsPanel({
  listings,
  unresolved,
  appCount,
  localCount,
  status,
  open,
  onToggle,
}: InsightsPanelProps) {
  const now = new Date();
  const recent = listings.filter((listing) => isRecentlyUpdated(listing, now)).length;
  const apple = listings.filter((listing) => listing.platform === 'apple').length;
  const google = listings.length - apple;
  const failing = listings.filter((listing) => listing.checkStatus === 'error').length;
  const lastRun = status?.lastRunAt ? relativeTime(status.lastRunAt, now) : null;

  const summary = [
    `${appCount} apps`,
    recent > 0 ? `${recent} updated this week` : null,
    failing > 0 ? `${failing} failing` : null,
    unresolved.length > 0 ? `${unresolved.length} unresolved` : null,
    lastRun ? `checked ${lastRun}` : 'no checks yet',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section class={`insights${open ? ' is-open' : ''}`} aria-label="Tracking insights">
      <button
        type="button"
        class="insights__toggle"
        aria-expanded={open}
        aria-controls="insights-body"
        onClick={onToggle}
      >
        <ChevronDownIcon size={15} />
        <span class="insights__title">Insights</span>
        <span class="insights__summary">{summary}</span>
      </button>
      <div class="insights__reveal" inert={!open}>
        <div class="insights__clip">
          <dl class="insights__grid" id="insights-body">
            <Stat
              label="Tracked apps"
              value={String(appCount)}
              detail={`${listings.length} listings`}
            />
            <Stat label="App Store" value={String(apple)} detail="listings" />
            <Stat label="Google Play" value={String(google)} detail="listings" />
            <Stat label={`Updated in ${RECENT_DAYS} days`} value={String(recent)} />
            <Stat
              label="Failing checks"
              value={String(failing)}
              detail={failing > 0 ? 'showing last good data' : 'all healthy'}
            />
            <Stat
              label="Last check"
              value={lastRun ?? 'not yet'}
              detail={
                status?.lastRunAt ? (formatDateTime(status.lastRunAt) ?? undefined) : undefined
              }
            />
            <Stat label="Schedule" value="Every 2 hours" detail="automatic, every tracked app" />
            <Stat
              label="Your local watches"
              value={String(localCount)}
              detail="this browser only"
            />
            {unresolved.length > 0 ? (
              <Stat
                label="Couldn’t resolve"
                value={String(unresolved.length)}
                detail={`${unresolved
                  .slice(0, 4)
                  .map((app) => app.storeId)
                  .join(', ')}${unresolved.length > 4 ? ', …' : ''}`}
              />
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  );
}
