import type { AppRecord } from '../shared/types.ts';
import { isRecentlyUpdated } from '../lib/filtering.ts';
import { formatDate, relativeTime } from '../lib/format.ts';
import { truncate } from '../shared/text.ts';
import { AppIcon } from './AppIcon.tsx';
import { AlertIcon, ExternalIcon } from './Icons.tsx';
import { PlatformBadge, platformLabel } from './PlatformBadge.tsx';
import { WatchButton } from './WatchButton.tsx';

export type AppSource = 'tracked' | 'local';

interface AppCardProps {
  app: AppRecord;
  source: AppSource;
  watched: boolean;
  open: boolean;
  onToggleWatch: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

/**
 * One app in the collection. Distinct visual states, deliberately different
 * from one another: hover (slight lift), keyboard focus (focus ring on the
 * controls), recently updated (left accent stripe + label), watched (filled
 * star), open (accent border while its detail panel is showing), and check
 * failed (small alert badge). A recently updated card never borrows the
 * hover/selected treatment.
 */
export function AppCard({ app, source, watched, open, onToggleWatch, onOpenDetail }: AppCardProps) {
  const recent = isRecentlyUpdated(app);
  const updatedWhen = relativeTime(app.releaseDate);
  const notes = app.releaseNotes ? truncate(app.releaseNotes, 120) : null;

  const classes = ['card'];
  if (recent) classes.push('card--recent');
  if (open) classes.push('card--open');

  return (
    <article class={classes.join(' ')} aria-label={app.name}>
      <div class="card__top">
        <AppIcon name={app.name} iconUrl={app.iconUrl} size={48} />
        <div class="card__title">
          <h3 class="card__name">{app.name}</h3>
          <p class="card__developer">{app.developer ?? ' '}</p>
        </div>
        <WatchButton appName={app.name} watched={watched} onToggle={() => onToggleWatch(app.id)} />
      </div>

      <div class="card__meta">
        {app.currentVersion ? <span class="version-chip">{app.currentVersion}</span> : null}
        {app.previousVersion ? (
          <span class="card__prev" title={`Previous version: ${app.previousVersion}`}>
            was {app.previousVersion}
          </span>
        ) : null}
        <PlatformBadge platform={app.platform} />
        {source === 'local' ? (
          <span class="badge badge--local" title="Watched only in this browser">
            Local
          </span>
        ) : null}
        {recent ? <span class="badge badge--recent">Updated</span> : null}
        {app.checkStatus === 'error' ? (
          <span class="badge badge--error" title={app.checkError ?? 'The last check failed'}>
            <AlertIcon size={11} /> Check failed
          </span>
        ) : null}
      </div>

      {updatedWhen ? (
        <p class="card__when">
          {source === 'local' ? 'Store release' : 'Released'} {formatDate(app.releaseDate)} ·{' '}
          {updatedWhen}
        </p>
      ) : null}

      {notes ? <p class="card__notes">{notes}</p> : null}

      <div class="card__actions">
        <button type="button" class="button button--primary" onClick={() => onOpenDetail(app.id)}>
          Details
        </button>
        <a
          class="button button--ghost"
          href={app.storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${app.name} on the ${platformLabel(app.platform)} (opens in a new tab)`}
        >
          {platformLabel(app.platform)} <ExternalIcon size={12} />
        </a>
      </div>
    </article>
  );
}
