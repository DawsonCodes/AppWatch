import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AppCard } from './components/AppCard.tsx';
import { AppPage } from './components/AppPage.tsx';
import type { HistoryState } from './components/AppPage.tsx';
import { DiscoverySection } from './components/DiscoverySection.tsx';
import type { DiscoveryState } from './components/DiscoverySection.tsx';
import { Dropdown } from './components/Dropdown.tsx';
import {
  AppNotFound,
  LoadFailed,
  LoadingGrid,
  NoAppsYet,
  NoResults,
} from './components/EmptyStates.tsx';
import { ExpectedSoon } from './components/ExpectedSoon.tsx';
import type { ExpectedItem } from './components/ExpectedSoon.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { CheckIcon, GridIcon, PulseIcon } from './components/Icons.tsx';
import { InsightsPanel } from './components/InsightsPanel.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { storeLabel } from './components/StoreBadge.tsx';
import { Tabs } from './components/Tabs.tsx';
import { Toast } from './components/Toast.tsx';
import type { ToastMessage } from './components/Toast.tsx';
import { UpdatesTimeline } from './components/UpdatesTimeline.tsx';
import type { Cadence } from './lib/cadence.ts';
import { computeCadence, nextSortTime, rhythmLine } from './lib/cadence.ts';
import { CATALOG } from './lib/catalogData.ts';
import {
  DataLoadError,
  isDataStale,
  loadDashboardData,
  loadHistory,
  STALE_AFTER_HOURS,
} from './lib/data.ts';
import type { DiscoveredApp } from './lib/discovery.ts';
import { lookupAppleById, searchAppleByName } from './lib/discovery.ts';
import { isUnresolved } from './lib/filtering.ts';
import { FRESHNESS_POLL_MS, hasNewerRun, pollStatus } from './lib/freshness.ts';
import type { AppGroup, GroupFilters, Listing, SortKey } from './lib/groups.ts';
import {
  buildGroups,
  DEFAULT_GROUP_FILTERS,
  filterGroups,
  findByListingId,
  hasActiveGroupFilters,
  isGroupWatched,
  visibleCollections,
} from './lib/groups.ts';
import { createLocalAppsStore, makeLocalApp } from './lib/localApps.ts';
import type { LocalApp } from './lib/localApps.ts';
import { themeReveal } from './lib/motion.ts';
import { readPref, writePref } from './lib/prefs.ts';
import type { Route } from './lib/route.ts';
import { appHref, parseRoute } from './lib/route.ts';
import { applyTheme, currentTheme, persistTheme } from './lib/theme.ts';
import type { ThemeId } from './lib/theme.ts';
import { buildTimeline } from './lib/timeline.ts';
import { createWatchlist } from './lib/watchlist.ts';
import { parseStoreInput, storeUrlFor } from './shared/storeRefs.ts';
import type {
  AppRecord,
  HistoryFile,
  Platform,
  StatusFile,
  StorePlatform,
} from './shared/types.ts';
import { appId, PLATFORMS } from './shared/types.ts';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; apps: AppRecord[]; status: StatusFile | null };

type HistoryLoad =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; file: HistoryFile };

type View = 'apps' | 'updates';

const INSIGHTS_PREF_KEY = 'appwatch:insights-open:v1';
const VIEW_PREF_KEY = 'appwatch:view:v1';
const BASE_TITLE = typeof document === 'undefined' ? 'AppWatch' : document.title;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'next', label: 'Next update' },
  { value: 'name', label: 'Name' },
  { value: 'collection', label: 'Category' },
];

function historyFor(load: HistoryLoad, id: string): HistoryState {
  if (load.phase === 'ready') return { phase: 'ready', entries: load.file.entries[id] ?? [] };
  if (load.phase === 'error') return { phase: 'error' };
  return { phase: 'loading' };
}

function localToListing(local: LocalApp): Listing {
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

function Chip({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: string }) {
  return (
    <button type="button" class={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onToggle}>
      {on ? <CheckIcon size={13} /> : null}
      {children}
    </button>
  );
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [filters, setFilters] = useState<GroupFilters>(DEFAULT_GROUP_FILTERS);
  const [view, setView] = useState<View>(() =>
    readPref(VIEW_PREF_KEY) === 'updates' ? 'updates' : 'apps',
  );
  const [theme, setTheme] = useState<ThemeId>(currentTheme);
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [historyLoad, setHistoryLoad] = useState<HistoryLoad>({ phase: 'idle' });
  const [insightsOpen, setInsightsOpen] = useState(() => readPref(INSIGHTS_PREF_KEY) === '1');
  const [discovery, setDiscovery] = useState<DiscoveryState>({ phase: 'idle' });
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const refreshing = useRef(false);

  const watchlist = useMemo(() => createWatchlist(), []);
  const [watchedIds, setWatchedIds] = useState<ReadonlySet<string>>(() => watchlist.ids());

  const localStore = useMemo(() => createLocalAppsStore(), []);
  const [localApps, setLocalApps] = useState<LocalApp[]>(() => localStore.list());

  const showToast = useCallback((text: string, action?: ToastMessage['action']) => {
    setToast({ id: Date.now(), text, action });
  }, []);
  const dropToast = useCallback(() => setToast(null), []);

  /**
   * Load the app data. A soft refresh (when a newer check has been deployed)
   * swaps the data in place, keeping filters, scroll position and the open
   * page, and says so briefly.
   */
  const fetchData = useCallback(
    (soft = false) => {
      if (soft && refreshing.current) return;
      refreshing.current = true;
      if (!soft) setLoad({ phase: 'loading' });
      loadDashboardData()
        .then(({ apps, status }) => {
          setLoad({ phase: 'ready', apps: apps.apps, status });
          if (soft) {
            setHistoryLoad({ phase: 'idle' });
            const updates = status?.updatesDetected ?? 0;
            showToast(
              `Refreshed with the latest check${
                updates > 0 ? ` · ${updates} new update${updates === 1 ? '' : 's'}` : ''
              }`,
            );
          }
        })
        .catch((error: unknown) => {
          if (soft) return; // keep showing the data we already have
          setLoad({
            phase: 'error',
            message:
              error instanceof DataLoadError ? error.message : 'Something unexpected went wrong.',
          });
        })
        .finally(() => {
          refreshing.current = false;
        });
    },
    [showToast],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Version history drives the update estimates on every card, so it loads
  // as soon as the app list is in.
  useEffect(() => {
    if (load.phase !== 'ready' || historyLoad.phase !== 'idle') return;
    setHistoryLoad({ phase: 'loading' });
    loadHistory()
      .then((file) => setHistoryLoad({ phase: 'ready', file }))
      .catch(() => setHistoryLoad({ phase: 'error' }));
  }, [load.phase, historyLoad.phase]);

  // While the page is visible, re-check the site's own status.json every few
  // minutes and when the tab regains focus; a newer deployed check is loaded
  // automatically. The stores are never contacted from the browser.
  const loadedRunAt = load.phase === 'ready' ? (load.status?.lastRunAt ?? null) : null;
  useEffect(() => {
    if (load.phase !== 'ready') return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const polled = await pollStatus();
      if (!cancelled && polled && hasNewerRun(loadedRunAt, polled.lastRunAt)) fetchData(true);
    };
    const interval = setInterval(check, FRESHNESS_POLL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [load.phase, loadedRunAt, fetchData]);

  /* -------------------------------- Routing ------------------------------- */

  // Pages are hash links (#app=apple:123). The list's scroll position is
  // kept while an app page is open and restored on the way back.
  const routeRef = useRef(route);
  const listScroll = useRef(0);
  const cameFromList = useRef(false);
  const leftGroupKey = useRef<string | null>(null);
  const pendingScroll = useRef<number | null>(null);

  useEffect(() => {
    try {
      history.scrollRestoration = 'manual';
    } catch {
      // Not supported: the browser keeps its default behavior.
    }
    const onHashChange = () => {
      const prev = routeRef.current;
      const next = parseRoute(location.hash);
      if (prev.page === 'list' && next.page === 'app') {
        listScroll.current = window.scrollY;
        cameFromList.current = true;
        pendingScroll.current = 0;
      } else if (prev.page === 'app' && next.page === 'list') {
        pendingScroll.current = cameFromList.current ? listScroll.current : 0;
        cameFromList.current = false;
      } else if (next.page === 'app') {
        pendingScroll.current = 0;
      }
      // A bare "#" (the logo or the back link) leaves the URL clean.
      if (next.page === 'list' && location.hash === '' && location.href.endsWith('#')) {
        try {
          history.replaceState(history.state, '', location.pathname + location.search);
        } catch {
          // Ignore.
        }
      }
      routeRef.current = next;
      setRoute(next);
    };
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, []);

  // Back to the list: step back in history when the list is the previous
  // page, so Back and Forward stay in sync; otherwise follow the link.
  const goBack = useCallback((event: MouseEvent) => {
    if (cameFromList.current) {
      event.preventDefault();
      history.back();
    }
  }, []);

  // Switching platform tabs on an app page replaces the URL instead of
  // adding a history entry for every tab.
  const selectListing = useCallback((listingId: string) => {
    try {
      history.replaceState(history.state, '', appHref(listingId));
    } catch {
      // Ignore: the page still switches.
    }
    const next: Route = { page: 'app', listingId };
    routeRef.current = next;
    setRoute(next);
  }, []);

  /* ------------------------------ Data model ------------------------------ */

  const loadedApps = load.phase === 'ready' ? load.apps : [];
  const status = load.phase === 'ready' ? load.status : null;
  const trackedListings = useMemo(
    () =>
      loadedApps
        .filter((app) => !isUnresolved(app))
        .map((app): Listing => ({ ...app, source: 'tracked' })),
    [loadedApps],
  );
  const unresolved = useMemo(() => loadedApps.filter(isUnresolved), [loadedApps]);
  const trackedIds = useMemo(() => new Set(trackedListings.map((l) => l.id)), [trackedListings]);
  const localListings = useMemo(
    () => localApps.filter((local) => !trackedIds.has(local.id)).map(localToListing),
    [localApps, trackedIds],
  );
  const groups = useMemo(
    () => buildGroups(CATALOG, trackedListings, localListings),
    [trackedListings, localListings],
  );
  const collections = useMemo(() => visibleCollections(CATALOG, groups), [groups]);
  const collectionOrder = useMemo(() => collections.map((c) => c.id), [collections]);
  const collectionLabels = useMemo(
    () => new Map(collections.map((c) => [c.id, c.label])),
    [collections],
  );
  const knownIds = useMemo(
    () => new Set([...trackedIds, ...localListings.map((l) => l.id)]),
    [trackedIds, localListings],
  );

  // Update estimate per tracked listing, and per app the listing whose next
  // update is expected soonest. One "now" per history load keeps the card
  // line and the app page saying the same thing.
  const rhythmNow = useMemo(() => new Date(), [historyLoad]);
  const cadences = useMemo(() => {
    if (historyLoad.phase !== 'ready') return null;
    const map = new Map<string, Cadence>();
    for (const listing of trackedListings) {
      map.set(listing.id, computeCadence(historyLoad.file.entries[listing.id] ?? [], rhythmNow));
    }
    return map;
  }, [historyLoad, trackedListings, rhythmNow]);
  const groupRhythm = useMemo(() => {
    const map = new Map<string, { listing: Listing; cadence: Cadence; line: string | null }>();
    if (!cadences) return map;
    for (const group of groups) {
      let best: { listing: Listing; cadence: Cadence } | null = null;
      for (const listing of group.listings) {
        const cadence = cadences.get(listing.id);
        if (!cadence) continue;
        if (!best || nextSortTime(cadence) < nextSortTime(best.cadence))
          best = { listing, cadence };
      }
      if (best) map.set(group.key, { ...best, line: rhythmLine(best.cadence, rhythmNow) });
    }
    return map;
  }, [cadences, groups, rhythmNow]);
  const nextTimes = useMemo(
    () => new Map([...groupRhythm].map(([key, value]) => [key, nextSortTime(value.cadence)])),
    [groupRhythm],
  );
  const expected = useMemo<ExpectedItem[]>(() => {
    const items: ExpectedItem[] = [];
    for (const group of groups) {
      const rhythm = groupRhythm.get(group.key);
      if (rhythm && (rhythm.cadence.state === 'upcoming' || rhythm.cadence.state === 'due')) {
        items.push({ group, listing: rhythm.listing, cadence: rhythm.cadence });
      }
    }
    return items
      .sort((a, b) => (a.cadence.next?.likely ?? 0) - (b.cadence.next?.likely ?? 0))
      .slice(0, 8);
  }, [groups, groupRhythm]);
  const dueSoon = useMemo(() => {
    if (!cadences) return null;
    const horizon = rhythmNow.getTime() + 3 * 86_400_000;
    return [...groupRhythm.values()].filter(
      ({ cadence }) =>
        cadence.state === 'due' ||
        (cadence.state === 'upcoming' && (cadence.next?.likely ?? Infinity) <= horizon),
    ).length;
  }, [cadences, groupRhythm, rhythmNow]);

  const filteredGroups = useMemo(
    () => filterGroups(groups, filters, watchedIds, collectionOrder, undefined, nextTimes),
    [groups, filters, watchedIds, collectionOrder, nextTimes],
  );
  const presentPlatforms = useMemo(
    () => PLATFORMS.filter((p) => groups.some((g) => g.listings.some((l) => l.platform === p))),
    [groups],
  );

  const timeline = useMemo(() => {
    if (view !== 'updates' || historyLoad.phase !== 'ready') return [];
    const scope = filterGroups(
      groups,
      { ...filters, recentOnly: false },
      watchedIds,
      collectionOrder,
    );
    return buildTimeline(scope, historyLoad.file);
  }, [view, historyLoad, groups, filters, watchedIds, collectionOrder]);

  const found = route.page === 'app' ? findByListingId(groups, route.listingId) : null;

  // Scroll and focus after the page has switched, before it is painted.
  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (target === null) return;
    if (route.page === 'list' && load.phase !== 'ready') return; // wait for the list
    pendingScroll.current = null;
    window.scrollTo(0, target);
    if (route.page === 'app') {
      document.getElementById('app-title')?.focus({ preventScroll: true });
    } else if (leftGroupKey.current) {
      document
        .querySelector<HTMLElement>(
          `.card[data-key="${CSS.escape(leftGroupKey.current)}"] .card__link`,
        )
        ?.focus({ preventScroll: true });
    }
  });

  useEffect(() => {
    if (found) leftGroupKey.current = found.group.key;
    document.title = found ? `${found.group.name} updates · AppWatch` : BASE_TITLE;
  }, [found?.group.key, found?.group.name]);

  /* ------------------------------- Actions -------------------------------- */

  const updateFilters = useCallback((next: Partial<GroupFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_GROUP_FILTERS);
    setDiscovery({ phase: 'idle' });
  }, []);

  const changeView = useCallback((next: View) => {
    writePref(VIEW_PREF_KEY, next);
    setView(next);
  }, []);

  const changeTheme = useCallback((next: ThemeId, origin: HTMLElement | null) => {
    themeReveal(
      () => {
        applyTheme(next);
        persistTheme(next);
        setTheme(next);
      },
      origin,
      next === 'ms-paint',
    );
  }, []);

  const toggleInsights = useCallback((open: boolean) => {
    writePref(INSIGHTS_PREF_KEY, open ? '1' : '0');
    setInsightsOpen(open);
  }, []);

  const removeLocalGroup = useCallback(
    (group: AppGroup) => {
      const removed = localApps.filter((local) => group.listings.some((l) => l.id === local.id));
      let list = localApps;
      for (const local of removed) list = localStore.remove(local.id);
      setLocalApps(list);
      showToast(`Removed ${group.name}`, {
        label: 'Undo',
        run: () => {
          let restored = localStore.list();
          for (const local of removed) restored = localStore.save(local);
          setLocalApps(restored);
        },
      });
    },
    [localApps, localStore, showToast],
  );

  const toggleWatch = useCallback(
    (group: AppGroup) => {
      if (group.source === 'local') {
        removeLocalGroup(group);
        return;
      }
      const watching = isGroupWatched(group, watchedIds);
      watchlist.setMany(
        group.listings.map((l) => l.id),
        !watching,
      );
      setWatchedIds(watchlist.ids());
    },
    [removeLocalGroup, watchedIds, watchlist],
  );

  /* ------------------------------- Discovery ------------------------------ */

  const parsedRef = useMemo(() => parseStoreInput(filters.query), [filters.query]);

  const submitSearch = useCallback(() => {
    const input = filters.query.trim();
    if (input.length < 2) return;
    if (view !== 'apps') changeView('apps');
    if (parsedRef && knownIds.has(appId(parsedRef.platform, parsedRef.storeId))) return;
    if (parsedRef?.platform === 'google') return; // offered as a local save; nothing to fetch
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
  }, [filters.query, parsedRef, knownIds, view, changeView]);

  const addDiscovered = useCallback(
    (app: DiscoveredApp) => {
      setLocalApps(localStore.save(discoveredToLocal(app)));
      showToast(`Saved ${app.name} in this browser`);
    },
    [localStore, showToast],
  );

  const addUnresolved = useCallback(
    (ref: { platform: StorePlatform; storeId: string; country?: string }) => {
      const list = localStore.save(
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
      );
      setLocalApps(list);
      showToast(`Saved ${ref.storeId} in this browser`);
    },
    [localStore, showToast],
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

  // "/" jumps to search on the list page from anywhere that isn't a text field.
  useEffect(() => {
    if (route.page !== 'list') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [route.page]);

  /* -------------------------------- Render -------------------------------- */

  const ready = load.phase === 'ready';
  const active = hasActiveGroupFilters(filters);
  const localGroupCount = groups.filter((g) => g.source === 'local').length;
  const trackedGroupCount = groups.length - localGroupCount;

  const platformOptions: { value: 'all' | Platform; label: string }[] = [
    { value: 'all', label: 'All platforms' },
    ...presentPlatforms.map((platform) => ({ value: platform, label: storeLabel(platform) })),
  ];

  const collectionTabs = [
    { value: 'all', label: 'All', count: groups.length },
    ...collections.map((c) => ({ value: c.id, label: c.label, count: c.count })),
  ];

  const selectedLocal =
    found?.listing.source === 'local'
      ? (localApps.find((local) => local.id === found.listing.id) ?? null)
      : null;

  const appPage =
    route.page === 'app' ? (
      found ? (
        <AppPage
          key={found.group.key}
          group={found.group}
          listing={found.listing}
          collectionLabel={collectionLabels.get(found.group.collection) ?? null}
          history={historyFor(historyLoad, found.listing.id)}
          watched={isGroupWatched(found.group, watchedIds)}
          now={rhythmNow}
          onSelectListing={selectListing}
          onToggleWatch={() => toggleWatch(found.group)}
          onBack={goBack}
          onRefreshLocal={selectedLocal ? refreshLocal : undefined}
          localRefreshing={localRefreshing}
          localAddedAt={selectedLocal?.addedAt ?? null}
        />
      ) : load.phase === 'error' ? (
        <LoadFailed message={load.message} onRetry={() => fetchData()} />
      ) : ready ? (
        <AppNotFound />
      ) : (
        <div class="app-page" aria-hidden="true">
          <div class="loading-lines">
            <span class="skeleton skeleton--icon skeleton--icon-lg" />
            <span class="skeleton skeleton--line" style={{ width: '40%' }} />
            <span class="skeleton skeleton--line" style={{ width: '25%' }} />
          </div>
        </div>
      )
    ) : null;

  return (
    <>
      <div class="layout">
        <a
          class="skip-link"
          href="#main"
          onClick={(event) => {
            event.preventDefault();
            mainRef.current?.focus();
          }}
        >
          Skip to content
        </a>
        <Header status={status} theme={theme} onThemeChange={changeTheme} />

        <main id="main" class="main" ref={mainRef} tabIndex={-1}>
          {appPage ?? (
            <div class="list-page">
              <section class="intro" aria-labelledby="intro-title">
                <h1 class="intro__title" id="intro-title">
                  App updates
                </h1>
                <p class="intro__sub">
                  Version history and release notes for {ready ? trackedGroupCount : 'popular'} apps
                  on the App Store, Google Play, Windows and Mac. Checked every two hours.
                </p>
              </section>

              {ready && isDataStale(status) ? (
                <p class="notice notice--warn" role="status">
                  The last check was more than {STALE_AFTER_HOURS} hours ago, so this may be out of
                  date.
                </p>
              ) : null}
              {ready && !watchlist.persistent && (watchedIds.size > 0 || localApps.length > 0) ? (
                <p class="notice" role="status">
                  Your browser is blocking storage, so your watchlist won’t be saved.
                </p>
              ) : null}

              <div class="toolbar">
                <Tabs
                  class="view-tabs"
                  variant="pill"
                  role="tablist"
                  label="View"
                  controls="view-panel"
                  value={view}
                  onChange={changeView}
                  items={[
                    { value: 'apps', label: 'Apps', icon: <GridIcon size={15} /> },
                    { value: 'updates', label: 'Updates', icon: <PulseIcon size={15} /> },
                  ]}
                />
                <SearchBar
                  value={filters.query}
                  inputRef={searchRef}
                  onSubmit={submitSearch}
                  onInput={(query) => {
                    updateFilters({ query });
                    setDiscovery({ phase: 'idle' });
                  }}
                />
              </div>

              {ready ? (
                <div class="categories">
                  <Tabs
                    variant="chips"
                    role="radiogroup"
                    label="Categories"
                    value={filters.collection}
                    onChange={(collection) => updateFilters({ collection })}
                    items={collectionTabs}
                  />
                </div>
              ) : null}

              {ready ? (
                <div class="filters">
                  <Dropdown
                    label="Platform"
                    options={platformOptions}
                    value={filters.platform}
                    onChange={(platform) => updateFilters({ platform })}
                  />
                  {view === 'apps' ? (
                    <Chip
                      on={filters.recentOnly}
                      onToggle={() => updateFilters({ recentOnly: !filters.recentOnly })}
                    >
                      Updated this week
                    </Chip>
                  ) : null}
                  <Chip
                    on={filters.watchedOnly}
                    onToggle={() => updateFilters({ watchedOnly: !filters.watchedOnly })}
                  >
                    Watching
                  </Chip>
                  <span class="filters__spacer" />
                  {view === 'apps' ? (
                    <Dropdown
                      label="Sort by"
                      options={SORT_OPTIONS}
                      value={filters.sort}
                      onChange={(sort) => updateFilters({ sort })}
                      align="end"
                      buttonContent={
                        <>
                          <span class="dropdown__prefix">Sort:</span>
                          {SORT_OPTIONS.find((o) => o.value === filters.sort)?.label}
                        </>
                      }
                    />
                  ) : null}
                </div>
              ) : null}

              {ready ? (
                <p class="results" aria-live="polite">
                  {view === 'apps'
                    ? filteredGroups.length === groups.length
                      ? `${groups.length} apps`
                      : `${filteredGroups.length} of ${groups.length} apps`
                    : historyLoad.phase === 'ready'
                      ? `${timeline.length} update${timeline.length === 1 ? '' : 's'} recorded`
                      : 'Loading updates…'}
                  {active ? (
                    <button type="button" class="link-button" onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : null}
                </p>
              ) : null}

              <div
                class="view"
                id="view-panel"
                role="tabpanel"
                aria-label={view === 'apps' ? 'Apps' : 'Updates'}
              >
                {load.phase === 'loading' ? <LoadingGrid /> : null}
                {load.phase === 'error' ? (
                  <LoadFailed message={load.message} onRetry={() => fetchData()} />
                ) : null}

                {ready && view === 'apps' ? (
                  <>
                    <DiscoverySection
                      query={filters.query}
                      parsedRef={parsedRef}
                      knownIds={knownIds}
                      state={discovery}
                      onLookup={submitSearch}
                      onAddDiscovered={addDiscovered}
                      onAddUnresolved={addUnresolved}
                    />
                    {groups.length === 0 ? (
                      <NoAppsYet />
                    ) : filteredGroups.length === 0 ? (
                      <NoResults
                        onClear={clearFilters}
                        searching={filters.query.trim().length > 1}
                      />
                    ) : (
                      <div class="grid">
                        {filteredGroups.map((group) => (
                          <AppCard
                            key={group.key}
                            group={group}
                            watched={isGroupWatched(group, watchedIds)}
                            rhythm={
                              historyLoad.phase === 'ready'
                                ? (groupRhythm.get(group.key)?.line ?? null)
                                : historyLoad.phase === 'error'
                                  ? null
                                  : undefined
                            }
                            onToggleWatch={toggleWatch}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : null}

                {ready && view === 'updates' ? (
                  historyLoad.phase === 'ready' ? (
                    <>
                      <ExpectedSoon items={expected} now={rhythmNow} />
                      <UpdatesTimeline
                        events={timeline}
                        onClearFilters={clearFilters}
                        filtered={active}
                      />
                    </>
                  ) : historyLoad.phase === 'error' ? (
                    <LoadFailed
                      message="The update history couldn’t be loaded."
                      onRetry={() => setHistoryLoad({ phase: 'idle' })}
                    />
                  ) : (
                    <div class="loading-lines" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span class="skeleton skeleton--row" key={i} />
                      ))}
                    </div>
                  )
                ) : null}
              </div>

              {ready ? (
                <InsightsPanel
                  listings={trackedListings}
                  unresolved={unresolved}
                  appCount={trackedGroupCount}
                  localCount={localGroupCount}
                  status={status}
                  dueSoon={dueSoon}
                  open={insightsOpen}
                  onToggle={toggleInsights}
                />
              ) : null}
            </div>
          )}
        </main>

        <Footer />
      </div>

      {toast ? <Toast key={toast.id} toast={toast} onDone={dropToast} /> : null}
    </>
  );
}
