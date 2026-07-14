import type { AppRecord, StatusFile } from '../shared/types.ts';
import { isRecentlyUpdated, RECENT_DAYS } from '../lib/filtering.ts';
import { formatDateTime, relativeTime } from '../lib/format.ts';

interface StatsBarProps {
  apps: readonly AppRecord[];
  status: StatusFile | null;
}

interface StatProps {
  label: string;
  value: string;
  detail?: string;
  title?: string;
}

function Stat({ label, value, detail, title }: StatProps) {
  return (
    <div class="stat" title={title}>
      <span class="stat__value">{value}</span>
      <span class="stat__label">{label}</span>
      {detail ? <span class="stat__detail">{detail}</span> : null}
    </div>
  );
}

export function StatsBar({ apps, status }: StatsBarProps) {
  const now = new Date();
  const recent = apps.filter((app) => isRecentlyUpdated(app, now)).length;
  const apple = apps.filter((app) => app.platform === 'apple').length;
  const google = apps.filter((app) => app.platform === 'google').length;
  const lastCheck = status?.lastRunAt ? relativeTime(status.lastRunAt, now) : null;

  return (
    <section class="stats" aria-label="Overview">
      <Stat label="Tracked apps" value={String(apps.length)} />
      <Stat
        label={`Updated in ${RECENT_DAYS} days`}
        value={String(recent)}
        title={`Apps with updates detected in the last ${RECENT_DAYS} days`}
      />
      <Stat label="App Store" value={String(apple)} />
      <Stat label="Google Play" value={String(google)} />
      <Stat
        label="Last check"
        value={lastCheck ?? '—'}
        detail={status?.lastRunAt ? (formatDateTime(status.lastRunAt) ?? undefined) : 'not yet run'}
        title={
          status?.lastRunAt
            ? `Last completed check: ${formatDateTime(status.lastRunAt)}`
            : 'The scheduled checker has not run yet'
        }
      />
    </section>
  );
}
