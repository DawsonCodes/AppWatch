import { AlertIcon } from './Icons.tsx';

/** Placeholder cards shown while apps.json loads. */
export function LoadingGrid() {
  return (
    <div class="grid" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <div class="card card--skeleton" key={i}>
          <div class="card__head">
            <span class="skeleton skeleton--icon" />
            <div class="card__title">
              <span class="skeleton skeleton--line" style={{ width: '58%' }} />
              <span class="skeleton skeleton--line" style={{ width: '36%' }} />
            </div>
          </div>
          <span class="skeleton skeleton--row" />
          <span class="skeleton skeleton--line" style={{ width: '70%' }} />
        </div>
      ))}
    </div>
  );
}

/** apps.json could not be fetched or failed validation. */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div class="empty" role="alert">
      <AlertIcon size={24} class="empty__icon" />
      <h2>Couldn’t load the app list</h2>
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
    <div class="empty">
      <h2>No apps yet</h2>
      <p>The first check hasn’t finished. Check back soon.</p>
    </div>
  );
}

/** Filters or search matched nothing. */
export function NoResults({ onClear, searching }: { onClear: () => void; searching: boolean }) {
  return (
    <div class="empty">
      <h2>No apps match</h2>
      <p>
        {searching
          ? 'None of the tracked apps match. Press Enter to search the App Store.'
          : 'Try another category or clear the filters.'}
      </p>
      <button type="button" class="button" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

/** A link to an app that isn't tracked (or no longer is). */
export function AppNotFound() {
  return (
    <div class="empty">
      <h1>App not found</h1>
      <p>This app isn’t tracked here, or the link is wrong.</p>
      <a class="button button--primary" href="#">
        See all apps
      </a>
    </div>
  );
}
