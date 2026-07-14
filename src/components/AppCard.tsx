import type { AppRecord } from '../shared/types.ts';
import { isRecentlyUpdated } from '../lib/filtering.ts';
import { formatDate, relativeTime } from '../lib/format.ts';
import { truncate } from '../shared/text.ts';
import { AppIcon } from './AppIcon.tsx';
import { AlertIcon, ExternalIcon, StarIcon } from './Icons.tsx';
import { PlatformBadge, platformLabel } from './PlatformBadge.tsx';

interface AppCardProps {
  app: AppRecord;
  watched: boolean;
  onToggleWatch: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

export function AppCard({ app, watched, onToggleWatch, onOpenDetail }: AppCardProps) {
  const recent = isRecentlyUpdated(app);
  const released = formatDate(app.releaseDate);
  const releasedAgo = relativeTime(app.releaseDate);
  const notes = app.releaseNotes ? truncate(app.releaseNotes, 160) : null;

  return (
    <article class={`card${recent ? ' card--recent' : ''}`} aria-label={app.name}>
      <div class="card__top">
        <AppIcon name={app.name} iconUrl={app.iconUrl} size={56} />
        <div class="card__title">
          <h3 class="card__name">{app.name}</h3>
          {app.developer ? <p class="card__developer">{app.developer}</p> : null}
        </div>
        <button
          type="button"
          class={`icon-button icon-button--watch${watched ? ' is-watched' : ''}`}
          aria-pressed={watched}
          aria-label={watched ? `Unwatch ${app.name}` : `Watch ${app.name}`}
          title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          onClick={() => onToggleWatch(app.id)}
        >
          <StarIcon size={17} filled={watched} />
        </button>
      </div>

      <div class="card__badges">
        <PlatformBadge platform={app.platform} />
        {recent ? <span class="badge badge--recent">Recently updated</span> : null}
        {app.checkStatus === 'error' ? (
          <span class="badge badge--error" title={app.checkError ?? 'The last check failed'}>
            <AlertIcon size={12} /> Check failed
          </span>
        ) : null}
      </div>

      <dl class="card__meta">
        <div>
          <dt>Version</dt>
          <dd>
            <span class="version-chip">{app.currentVersion ?? 'unknown'}</span>
            {app.previousVersion ? (
              <span class="card__prev-version"> from {app.previousVersion}</span>
            ) : null}
          </dd>
        </div>
        {released ? (
          <div>
            <dt>Released</dt>
            <dd>
              {released}
              {releasedAgo ? <span class="card__relative"> · {releasedAgo}</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {notes ? <p class="card__notes">{notes}</p> : null}

      <div class="card__actions">
        <button type="button" class="button button--primary" onClick={() => onOpenDetail(app.id)}>
          Details
        </button>
        <a
          class="button"
          href={app.storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${app.name} on the ${platformLabel(app.platform)} (opens in a new tab)`}
        >
          {platformLabel(app.platform)} <ExternalIcon size={13} />
        </a>
      </div>
    </article>
  );
}
