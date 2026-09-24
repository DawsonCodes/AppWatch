import { AlertIcon, LogoIcon } from './Icons.tsx';

/** Skeleton cards shown while apps.json loads. */
export function LoadingGrid() {
  return (
    <div class="grid grid--loading" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <div class="card card--skeleton" key={i} style={{ '--i': i }}>
          <div class="card__head">
            <span class="skeleton skeleton--icon" />
            <div class="card__title">
              <span class="skeleton skeleton--line" style={{ width: '58%' }} />
              <span class="skeleton skeleton--line" style={{ width: '36%' }} />
            </div>
          </div>
          <span class="skeleton skeleton--row" />
          <span class="skeleton skeleton--row" />
          <span class="skeleton skeleton--line" style={{ width: '82%' }} />
        </div>
      ))}
    </div>
  );
}

/** apps.json could not be fetched or failed validation. */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div class="empty-state" role="alert">
      <span class="empty-state__icon empty-state__icon--error">
        <AlertIcon size={28} />
      </span>
      <h2>Couldn’t load app data</h2>
      <p>{message}</p>
      <button type="button" class="button button--primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** Data loaded fine but no apps have been captured yet (first check pending). */
export function NoAppsYet() {
  return (
    <div class="empty-state">
      <span class="empty-state__icon">
        <LogoIcon size={40} />
      </span>
      <h2>No app data yet</h2>
      <p>
        Tracked apps are configured in <code>apps.config.json</code>, and the scheduled checker
        publishes data after its first run. Check back soon — or search above to watch apps in this
        browser in the meantime.
      </p>
    </div>
  );
}

/** Filters/search produced zero matches. */
export function NoResults({ onClear, searching }: { onClear: () => void; searching: boolean }) {
  return (
    <div class="empty-state empty-state--compact">
      <h2>No matching apps here</h2>
      <p>
        {searching
          ? 'None of the tracked apps match. Press Enter to search the App Store.'
          : 'Try another collection or clear the filters.'}
      </p>
      <button type="button" class="button" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
