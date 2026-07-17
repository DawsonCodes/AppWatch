import { AlertIcon, LogoIcon } from './Icons.tsx';

/** Skeleton cards shown while apps.json loads. */
export function LoadingGrid() {
  return (
    <div class="grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div class="card card--skeleton" key={i}>
          <div class="card__top">
            <span class="skeleton skeleton--icon" />
            <div class="card__title">
              <span class="skeleton skeleton--line" style={{ width: '60%' }} />
              <span class="skeleton skeleton--line" style={{ width: '40%' }} />
            </div>
          </div>
          <span class="skeleton skeleton--line" style={{ width: '35%' }} />
          <span class="skeleton skeleton--line" style={{ width: '90%' }} />
        </div>
      ))}
    </div>
  );
}

/** apps.json could not be fetched or failed validation. */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div class="empty-state" role="alert">
      <AlertIcon size={32} />
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
      <LogoIcon size={40} />
      <h2>No app data yet</h2>
      <p>
        Tracked apps are configured in <code>apps.config.json</code>, and the scheduled checker
        publishes data after its first run. Check back soon — or search above to watch apps locally
        in the meantime.
      </p>
    </div>
  );
}

/** Filters/search produced zero matches. */
export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div class="empty-state empty-state--compact">
      <h2>No matching apps here</h2>
      <p>Adjust the filters, or use the store search below to look further.</p>
      <button type="button" class="button" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
