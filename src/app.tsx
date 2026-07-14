import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { AppCard } from './components/AppCard.tsx';
import { AppDetail } from './components/AppDetail.tsx';
import type { HistoryState } from './components/AppDetail.tsx';
import { LoadFailed, LoadingGrid, NoAppsYet, NoResults } from './components/EmptyStates.tsx';
import { FilterBar } from './components/FilterBar.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import type { Theme } from './components/Header.tsx';
import { StatsBar } from './components/StatsBar.tsx';
import { DataLoadError, isDataStale, loadDashboardData, loadHistory } from './lib/data.ts';
import { applyFilters, DEFAULT_FILTERS } from './lib/filtering.ts';
import type { FilterState } from './lib/filtering.ts';
import { createWatchlist } from './lib/watchlist.ts';
import type { AppRecord, HistoryFile, StatusFile } from './shared/types.ts';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; apps: AppRecord[]; status: StatusFile | null };

type HistoryLoad =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; file: HistoryFile };

const THEME_KEY = 'appwatch:theme';

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function readHashAppId(): string | null {
  const match = /^#app=(.+)$/.exec(location.hash);
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

function clearHash(): void {
  try {
    window.history.replaceState(null, '', location.pathname + location.search);
  } catch {
    location.hash = '';
  }
}

function historyForApp(load: HistoryLoad, appId: string): HistoryState {
  if (load.phase === 'ready') {
    return { phase: 'ready', entries: load.file.entries[appId] ?? [] };
  }
  if (load.phase === 'error') return { phase: 'error' };
  return { phase: 'loading' };
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [selectedId, setSelectedId] = useState<string | null>(readHashAppId);
  const [historyLoad, setHistoryLoad] = useState<HistoryLoad>({ phase: 'idle' });

  const watchlist = useMemo(() => createWatchlist(), []);
  const [watchedIds, setWatchedIds] = useState<ReadonlySet<string>>(() => watchlist.ids());

  const fetchData = useCallback(() => {
    setLoad({ phase: 'loading' });
    loadDashboardData()
      .then(({ apps, status }) => setLoad({ phase: 'ready', apps: apps.apps, status }))
      .catch((error: unknown) => {
        setLoad({
          phase: 'error',
          message:
            error instanceof DataLoadError ? error.message : 'Something unexpected went wrong.',
        });
      });
  }, []);

  useEffect(fetchData, [fetchData]);

  // Deep links: #app=<id> opens the detail view; back/forward keeps working.
  useEffect(() => {
    const onHashChange = () => setSelectedId(readHashAppId());
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, []);

  // Version history loads lazily, the first time a detail view opens.
  useEffect(() => {
    if (selectedId === null || historyLoad.phase !== 'idle') return;
    setHistoryLoad({ phase: 'loading' });
    loadHistory()
      .then((file) => setHistoryLoad({ phase: 'ready', file }))
      .catch(() => setHistoryLoad({ phase: 'error' }));
  }, [selectedId, historyLoad.phase]);

  const toggleTheme = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage unavailable: the choice simply won't persist.
    }
  }, []);

  const toggleWatch = useCallback(
    (id: string) => {
      watchlist.toggle(id);
      setWatchedIds(watchlist.ids());
    },
    [watchlist],
  );

  const openDetail = useCallback((id: string) => {
    location.hash = `app=${encodeURIComponent(id)}`;
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    if (location.hash) clearHash();
  }, []);

  const updateFilters = useCallback(
    (next: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...next })),
    [],
  );
  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const ready = load.phase === 'ready';
  const apps = ready ? load.apps : [];
  const status = ready ? load.status : null;
  const filtered = useMemo(
    () => applyFilters(apps, filters, watchedIds),
    [apps, filters, watchedIds],
  );
  const selectedApp = selectedId ? (apps.find((app) => app.id === selectedId) ?? null) : null;

  return (
    <div class="layout" id="top">
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <Header
        query={filters.query}
        onQueryChange={(query) => updateFilters({ query })}
        theme={theme}
        onToggleTheme={toggleTheme}
        status={status}
      />

      <main id="main" class="main">
        {load.phase === 'loading' ? <LoadingGrid /> : null}

        {load.phase === 'error' ? <LoadFailed message={load.message} onRetry={fetchData} /> : null}

        {ready && isDataStale(status) ? (
          <p class="notice notice--warn" role="status">
            The last completed check is more than a day old — the data below may be slightly out of
            date.
          </p>
        ) : null}

        {ready && !watchlist.persistent && watchedIds.size > 0 ? (
          <p class="notice" role="status">
            Browser storage is unavailable, so your watchlist will reset when you leave this page.
          </p>
        ) : null}

        {ready && apps.length === 0 ? <NoAppsYet /> : null}

        {ready && apps.length > 0 ? (
          <>
            <StatsBar apps={apps} status={status} />
            <FilterBar
              filters={filters}
              onChange={updateFilters}
              onClear={clearFilters}
              resultCount={filtered.length}
              totalCount={apps.length}
            />
            {filtered.length === 0 ? (
              <NoResults onClear={clearFilters} />
            ) : (
              <div class="grid">
                {filtered.map((app) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    watched={watchedIds.has(app.id)}
                    onToggleWatch={toggleWatch}
                    onOpenDetail={openDetail}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}
      </main>

      <Footer />

      {selectedApp ? (
        <AppDetail
          key={selectedApp.id}
          app={selectedApp}
          history={historyForApp(historyLoad, selectedApp.id)}
          watched={watchedIds.has(selectedApp.id)}
          onToggleWatch={toggleWatch}
          onClose={closeDetail}
        />
      ) : null}
    </div>
  );
}
