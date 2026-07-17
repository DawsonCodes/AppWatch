import type { AppRecord, StatusFile } from '../shared/types.ts';
import { isRecentlyUpdated, RECENT_DAYS } from '../lib/filtering.ts';
import { formatDateTime, relativeTime } from '../lib/format.ts';
import { ChevronDownIcon } from './Icons.tsx';

interface InsightsPanelProps {
  apps: readonly AppRecord[];
  localCount: number;
  status: StatusFile | null;
  open: boolean;
  onToggle: () => void;
}

function Row({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div class="insights__row">
      <dt>{label}</dt>
      <dd>
        {value}
        {detail ? <span class="insights__detail"> {detail}</span> : null}
      </dd>
    </div>
  );
}

/**
 * The quiet, collapsible replacement for the old row of large stat cards.
 * Collapsed by default; the open/closed choice persists locally.
 */
export function InsightsPanel({ apps, localCount, status, open, onToggle }: InsightsPanelProps) {
  const now = new Date();
  const recent = apps.filter((app) => isRecentlyUpdated(app, now)).length;
  const apple = apps.filter((app) => app.platform === 'apple').length;
  const google = apps.length - apple;
  const failing = apps.filter((app) => app.checkStatus === 'error').length;
  const lastRun = status?.lastRunAt ? relativeTime(status.lastRunAt, now) : null;

  const summary = [
    `${apps.length} tracked`,
    recent > 0 ? `${recent} updated this week` : null,
    failing > 0 ? `${failing} failing` : null,
    lastRun ? `checked ${lastRun}` : 'no checks yet',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section class={`insights${open ? ' insights--open' : ''}`} aria-label="Tracking insights">
      <button
        type="button"
        class="insights__toggle"
        aria-expanded={open}
        aria-controls="insights-body"
        onClick={onToggle}
      >
        <ChevronDownIcon size={14} />
        <span class="insights__title">Insights</span>
        <span class="insights__summary">{summary}</span>
      </button>
      <div class="insights__reveal" aria-hidden={!open}>
        <div class="insights__clip">
          <dl class="insights__body" id="insights-body">
            <Row label="Tracked apps" value={String(apps.length)} />
            <Row label="App Store" value={String(apple)} />
            <Row label="Google Play" value={String(google)} />
            <Row label={`Updated in ${RECENT_DAYS} days`} value={String(recent)} />
            <Row
              label="Your local watches"
              value={String(localCount)}
              detail="(this browser only)"
            />
            <Row
              label="Failing checks"
              value={String(failing)}
              detail={failing > 0 ? '(showing last good data)' : undefined}
            />
            <Row
              label="Last check"
              value={status?.lastRunAt ? (relativeTime(status.lastRunAt, now) ?? '—') : 'not yet'}
              detail={
                status?.lastRunAt ? (formatDateTime(status.lastRunAt) ?? undefined) : undefined
              }
            />
            <Row label="Schedule" value="12:00 AM & 12:00 PM" detail="Detroit time, daily" />
          </dl>
        </div>
      </div>
    </section>
  );
}
