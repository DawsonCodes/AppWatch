import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AppCard } from './components/AppCard.tsx';
import type { AppSource } from './components/AppCard.tsx';
import { AppDetail } from './components/AppDetail.tsx';
import type { HistoryState } from './components/AppDetail.tsx';
import { DiscoverySection } from './components/DiscoverySection.tsx';
import type { DiscoveryState } from './components/DiscoverySection.tsx';
import { LoadFailed, LoadingGrid, NoAppsYet, NoResults } from './components/EmptyStates.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { CloseIcon } from './components/Icons.tsx';
import { InsightsPanel } from './components/InsightsPanel.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { DataLoadError, isDataStale, loadDashboardData, loadHistory } from './lib/data.ts';
import type { DiscoveredApp } from './lib/discovery.ts';
import { lookupAppleById, searchAppleByName } from './lib/discovery.ts';
import { applyFilters, DEFAULT_FILTERS } from './lib/filtering.ts';
import type { FilterState } from './lib/filtering.ts';
import { FRESHNESS_POLL_MS, hasNewerRun, pollStatus } from './lib/freshness.ts';
import { createLocalAppsStore, makeLocalApp } from './lib/localApps.ts';
import type { LocalApp } from './lib/localApps.ts';
import { readPref, writePref } from './lib/prefs.ts';
import { applyTheme, currentTheme, persistTheme } from './lib/theme.ts';
import type { ThemeId } from './lib/theme.ts';
import { createWatchlist } from './lib/watchlist.ts';
import { parseStoreInput, storeUrlFor } from './shared/storeRefs.ts';
import type { AppRecord, HistoryFile, StatusFile } from './shared/types.ts';
import { appId } from './shared/types.ts';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; apps: AppRecord[]; status: StatusFile | null };

type HistoryLoad =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; file: HistoryFile };

type FlatApp = AppRecord & { source: AppSource };

const INSIGHTS_PREF_KEY = 'appwatch:insights-open:v1';

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

function historyForApp(load: HistoryLoad, id: string): HistoryState {
  if (load.phase === 'ready') {
    return { phase: 'ready', entries: load.file.entries[id] ?? [] };
  }
  if (load.phase === 'error') return { phase: 'error' };
  return { phase: 'loading' };
}

function localToRecord(local: LocalApp): FlatApp {
  return {
    id: local.id,
    platform: local.platform,
    storeId: local.storeId,
    name: local.name,
    developer: local.developer,
    iconUrl: local.iconUrl,
    storeUrl: local.storeUrl,
    currentVersion: local.version,
    previousVersion: null,
    releaseDate: local.releaseDate,
    releaseNotes: null,
    category: local.category,
    bundleId: null,
    price: local.price,
    rating: local.rating,
    ratingCount: local.ratingCount,
    firstTrackedAt: local.addedAt,
    lastCheckedAt: local.refreshedAt,
    lastUpdatedAt: null,
    checkStatus: 'pending',
    checkError: null,
    updateDetected: false,
    source: 'local',
  };
}

function discoveredToLocal(app: DiscoveredApp): LocalApp {
  return makeLocalApp({
    platform: app.platform,
    storeId: app.storeId,
    name: app.name,
    developer: app.developer,
    iconUrl: app.iconUrl,
    storeUrl: app.storeUrl,
    version: app.version,
    releaseDate: app.releaseDate,
    category: app.category,
    price: app.price,
    rating: app.rating,
    ratingCount: app.ratingCount,
    resolved: true,
  });
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [theme, setTheme] = useState<ThemeId>(currentTheme);
  const [selectedId, setSelectedId] = useState<string | null>(readHashAppId);
  const [historyLoad, setHistoryLoad] = useState<HistoryLoad>({ phase: 'idle' });
  const [insightsOpen, setInsightsOpen] = useState(() => readPref(INSIGHTS_PREF_KEY) === '1');
  const [discovery, setDiscovery] = useState<DiscoveryState>({ phase: 'idle' });
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [newDataAvailable, setNewDataAvailable] = useState(false);
  const [freshnessDismissed, setFreshnessDismissed] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const detailTrigger = useRef<Element | null>(null);

  const watchlist = useMemo(() => createWatchlist(), []);
  const [watchedIds, setWatchedIds] = useState<ReadonlySet<string>>(() => watchlist.ids());

  const localStore = useMemo(() => createLocalAppsStore(), []);
  const [localApps, setLocalApps] = useState<LocalApp[]>(() => localStore.list());

  const fetchData = useCallback((soft = false) => {
    if (!soft) setLoad({ phase: 'loading' });
    loadDashboardData()
      .then(({ apps, status }) => {
        setLoad({ phase: 'ready', apps: apps.apps, status });
        setNewDataAvailable(false);
        setFreshnessDismissed(false);
      })
      .catch((error: unknown) => {
        if (soft) return; // keep showing the data we already have
        setLoad({
          phase: 'error',
          message:
            error instanceof DataLoadError ? error.message : 'Something unexpected went wrong.',
        });
      });
  }, []);

  useEffect(() => fetchData(), [fetchData]);

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

  // Deploy freshness: while the page is visible, revalidate the site's own
  // status.json on a restrained interval and offer a refresh when the
  // scheduled checker has deployed newer data. This never contacts the
  // stores from the visitor's browser.
  const loadedRunAt = load.phase === 'ready' ? (load.status?.lastRunAt ?? null) : null;
  useEffect(() => {
    if (load.phase !== 'ready') return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const polled = await pollStatus();
      if (!cancelled && polled && hasNewerRun(loadedRunAt, polled.lastRunAt)) {
        setNewDataAvailable(true);
      }
    };
    const interval = setInterval(check, FRESHNESS_POLL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [load.phase, loadedRunAt]);

  const changeTheme = useCallback((next: ThemeId) => {
    applyTheme(next);
    persistTheme(next);
    setTheme(next);
  }, []);

  const toggleInsights = useCallback(() => {
    setInsightsOpen((open) => {
      writePref(INSIGHTS_PREF_KEY, open ? '0' : '1');
      return !open;
    });
  }, []);

  const trackedApps = load.phase === 'ready' ? load.apps : [];
  const status = load.phase === 'ready' ? load.status : null;

  const trackedIds = useMemo(() => new Set(trackedApps.map((app) => app.id)), [trackedApps]);
  const allApps = useMemo<FlatApp[]>(() => {
    const tracked = trackedApps.map((app): FlatApp => ({ ...app, source: 'tracked' }));
    const locals = localApps
      .filter((local) => !trackedIds.has(local.id))
      .map((local) => localToRecord(local));
    return [...tracked, ...locals];
  }, [trackedApps, trackedIds, localApps]);

  const localIds = useMemo(
    () => new Set(localApps.filter((local) => !trackedIds.has(local.id)).map((l) => l.id)),
    [localApps, trackedIds],
  );
  const knownIds = useMemo(() => new Set(allApps.map((app) => app.id)), [allApps]);
  const watchedOrLocal = useMemo(() => {
    const ids = new Set(watchedIds);
    for (const id of localIds) ids.add(id);
    return ids;
  }, [watchedIds, localIds]);

  const toggleWatch = useCallback(
    (id: string) => {
      if (localIds.has(id)) {
        // Unstarring a browser-local app removes it from the local list.
        setLocalApps(localStore.remove(id));
        if (selectedId === id) {
          setSelectedId(null);
          clearHash();
        }
        return;
      }
      watchlist.toggle(id);
      setWatchedIds(watchlist.ids());
    },
    [localIds, localStore, selectedId, watchlist],
  );

  const openDetail = useCallback((id: string) => {
    detailTrigger.current = document.activeElement;
    location.hash = `app=${encodeURIComponent(id)}`;
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    if (location.hash) clearHash();
    const trigger = detailTrigger.current;
    detailTrigger.current = null;
    if (trigger instanceof HTMLElement && document.contains(trigger)) {
      trigger.focus();
    }
  }, []);

  const updateFilters = useCallback((next: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    if (next.query !== undefined) setDiscovery({ phase: 'idle' });
  }, []);
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDiscovery({ phase: 'idle' });
  }, []);

  const parsedRef = useMemo(() => parseStoreInput(filters.query), [filters.query]);

  const submitSearch = useCallback(() => {
    const input = filters.query.trim();
    if (input.length < 2) return;
    if (parsedRef && knownIds.has(appId(parsedRef.platform, parsedRef.storeId))) return;
    if (parsedRef?.platform === 'google') return; // panel offers local watch; nothing to fetch
    setDiscovery({ phase: 'loading', input });
    const request =
      parsedRef?.platform === 'apple'
        ? lookupAppleById(parsedRef.storeId, { country: parsedRef.country })
        : searchAppleByName(input);
    request.then((outcome) => {
      setDiscovery((current) =>
        current.phase === 'loading' && current.input === input
          ? { phase: 'done', input, outcome }
          : current,
      );
    });
  }, [filters.query, parsedRef, knownIds]);

  const addDiscovered = useCallback(
    (app: DiscoveredApp) => {
      setLocalApps(localStore.save(discoveredToLocal(app)));
    },
    [localStore],
  );

  const addUnresolved = useCallback(
    (ref: { platform: 'apple' | 'google'; storeId: string; country?: string }) => {
      setLocalApps(
        localStore.save(
          makeLocalApp({
            platform: ref.platform,
            storeId: ref.storeId,
            name: ref.storeId,
            developer: null,
            iconUrl: null,
            storeUrl: storeUrlFor(ref),
            version: null,
            releaseDate: null,
            category: null,
            price: null,
            rating: null,
            ratingCount: null,
            resolved: false,
          }),
        ),
      );
    },
    [localStore],
  );

  const refreshLocal = useCallback(
    (id: string) => {
      const local = localApps.find((app) => app.id === id);
      if (!local || local.platform !== 'apple' || localRefreshing) return;
      setLocalRefreshing(true);
      lookupAppleById(local.storeId)
        .then((outcome) => {
          if (outcome.kind === 'resolved' && outcome.apps[0]) {
            const fresh = discoveredToLocal(outcome.apps[0]);
            setLocalApps(localStore.save({ ...fresh, addedAt: local.addedAt }));
          }
        })
        .finally(() => setLocalRefreshing(false));
    },
    [localApps, localStore, localRefreshing],
  );

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const filtered = useMemo(
    () => applyFilters(allApps, filters, watchedOrLocal),
    [allApps, filters, watchedOrLocal],
  );

  const selectedApp = selectedId ? (allApps.find((app) => app.id === selectedId) ?? null) : null;
  const selectedLocal =
    selectedApp?.source === 'local'
      ? (localApps.find((local) => local.id === selectedApp.id) ?? null)
      : null;

  const ready = load.phase === 'ready';

  return (
    <div class="layout" id="top">
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <Header
        status={status}
        theme={theme}
        onThemeChange={changeTheme}
        onSearchJump={focusSearch}
      />

      <main id="main" class="main">
        <section class="intro">
          <h1 class="intro__title">Store updates, without the noise.</h1>
          <p class="intro__sub">
            AppWatch follows App Store and Google Play listings, keeps honest version history, and
            checks twice a day. Search by name, store link, Apple ID, or package name.
          </p>
        </section>

        {load.phase === 'loading' ? <LoadingGrid /> : null}
        {load.phase === 'error' ? <LoadFailed message={load.message} onRetry={fetchData} /> : null}

        {ready && isDataStale(status) ? (
          <p class="notice notice--warn" role="status">
            The last completed check is more than a day old — this data may be slightly out of date.
          </p>
        ) : null}

        {ready && !watchlist.persistent && (watchedIds.size > 0 || localApps.length > 0) ? (
          <p class="notice" role="status">
            Browser storage is unavailable, so watches added here will reset when you leave.
          </p>
        ) : null}

        {ready ? (
          <>
            <Toolbar
              filters={filters}
              onChange={updateFilters}
              onClear={clearFilters}
              onSubmitSearch={submitSearch}
              searchRef={searchRef}
              resultCount={filtered.length}
              totalCount={allApps.length}
            />

            <DiscoverySection
              query={filters.query}
              parsedRef={parsedRef}
              knownIds={knownIds}
              state={discovery}
              onLookup={submitSearch}
              onAddDiscovered={addDiscovered}
              onAddUnresolved={addUnresolved}
            />

            {allApps.length === 0 ? (
              <NoAppsYet />
            ) : filtered.length === 0 ? (
              <NoResults onClear={clearFilters} />
            ) : (
              <div class="grid">
                {filtered.map((app) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    source={app.source}
                    watched={watchedOrLocal.has(app.id)}
                    open={selectedId === app.id}
                    onToggleWatch={toggleWatch}
                    onOpenDetail={openDetail}
                  />
                ))}
              </div>
            )}

            <InsightsPanel
              apps={trackedApps}
              localCount={localIds.size}
              status={status}
              open={insightsOpen}
              onToggle={toggleInsights}
            />
          </>
        ) : null}
      </main>

      <Footer />

      {selectedApp ? (
        <AppDetail
          key={selectedApp.id}
          app={selectedApp}
          source={selectedApp.source}
          history={historyForApp(historyLoad, selectedApp.id)}
          watched={watchedOrLocal.has(selectedApp.id)}
          onToggleWatch={toggleWatch}
          onClose={closeDetail}
          onRefreshLocal={selectedLocal ? refreshLocal : undefined}
          localRefreshing={localRefreshing}
          localAddedAt={selectedLocal?.addedAt ?? null}
        />
      ) : null}

      {newDataAvailable && !freshnessDismissed ? (
        <div class="toast" role="status">
          <span class="toast__text">A newer check was just published.</span>
          <button type="button" class="button button--primary" onClick={() => fetchData(true)}>
            Refresh data
          </button>
          <button
            type="button"
            class="icon-button"
            aria-label="Dismiss"
            onClick={() => setFreshnessDismissed(true)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
