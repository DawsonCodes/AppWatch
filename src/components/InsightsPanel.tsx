import type { AppRecord, StatusFile } from '../shared/types.ts';
import { isRecentlyUpdated, RECENT_DAYS } from '../lib/filtering.ts';
import { formatDateTime, relativeTime } from '../lib/format.ts';
import { PLATFORMS } from '../shared/types.ts';
import { ChevronDownIcon } from './Icons.tsx';
import { storeLabel } from './StoreBadge.tsx';

interface InsightsPanelProps {
  /** Every tracked listing the checker has resolved. */
  listings: readonly AppRecord[];
  /** Configured listings the checker has never resolved (no card is shown for them). */
  unresolved: readonly AppRecord[];
  appCount: number;
  localCount: number;
  status: StatusFile | null;
  /** Apps expected to update within three days (null until history loads). */
  dueSoon?: number | null;
  open: boolean;
  onToggle: (open: boolean) => void;
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

/** Tracking stats, collapsed by default. The open/closed choice is remembered. */
export function InsightsPanel({
  listings,
  unresolved,
  appCount,
  localCount,
  status,
  dueSoon = null,
  open,
  onToggle,
}: InsightsPanelProps) {
  const now = new Date();
  const recent = listings.filter((listing) => isRecentlyUpdated(listing, now)).length;
  const perPlatform = PLATFORMS.map((platform) => ({
    platform,
    count: listings.filter((listing) => listing.platform === platform).length,
  })).filter(({ count }) => count > 0);
  const failing = listings.filter((listing) => listing.checkStatus === 'error').length;
  const lastRun = status?.lastRunAt ? relativeTime(status.lastRunAt, now) : null;

  const summary = [
    `${appCount} apps`,
    recent > 0 ? `${recent} updated this week` : null,
    failing > 0 ? `${failing} failing` : null,
    lastRun ? `checked ${lastRun}` : 'not checked yet',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <details
      class="insights"
      open={open}
      onToggle={(event) => {
        const next = (event.currentTarget as HTMLDetailsElement).open;
        if (next !== open) onToggle(next);
      }}
    >
      <summary class="insights__summary">
        <ChevronDownIcon size={15} />
        <span class="insights__title">Stats</span>
        <span class="insights__line">{summary}</span>
      </summary>
      <dl class="stats stats--wide">
        <Stat
          label="Tracked apps"
          value={String(appCount)}
          detail={`${listings.length} listings`}
        />
        {perPlatform.map(({ platform, count }) => (
          <Stat key={platform} label={storeLabel(platform)} value={String(count)} />
        ))}
        <Stat label={`Updated in the last ${RECENT_DAYS} days`} value={String(recent)} />
        <Stat
          label="Failing checks"
          value={String(failing)}
          detail={failing > 0 ? 'Showing the last good data' : 'All working'}
        />
        <Stat
          label="Last check"
          value={lastRun ?? 'Not yet'}
          detail={status?.lastRunAt ? (formatDateTime(status.lastRunAt) ?? undefined) : undefined}
        />
        <Stat label="Checks" value="Every 2 hours" />
        {dueSoon !== null ? (
          <Stat label="Expected in the next 3 days" value={String(dueSoon)} />
        ) : null}
        <Stat label="Saved in this browser" value={String(localCount)} />
        {unresolved.length > 0 ? (
          <Stat
            label="Couldn’t find"
            value={String(unresolved.length)}
            detail={`${unresolved
              .slice(0, 4)
              .map((app) => app.storeId)
              .join(', ')}${unresolved.length > 4 ? ', …' : ''}`}
          />
        ) : null}
      </dl>
    </details>
  );
}
