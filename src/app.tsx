import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AppCard } from './components/AppCard.tsx';
import { AppDetail } from './components/AppDetail.tsx';
import type { HistoryState } from './components/AppDetail.tsx';
import { DiscoverySection } from './components/DiscoverySection.tsx';
import type { DiscoveryState } from './components/DiscoverySection.tsx';
import { Dropdown } from './components/Dropdown.tsx';
import { LoadFailed, LoadingGrid, NoAppsYet, NoResults } from './components/EmptyStates.tsx';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { CheckIcon, CloseIcon, GridIcon, PulseIcon } from './components/Icons.tsx';
import { InsightsPanel } from './components/InsightsPanel.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { SlidingTabs } from './components/SlidingTabs.tsx';
import { UpdatesTimeline } from './components/UpdatesTimeline.tsx';
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
import { isUnresolved, RECENT_DAYS } from './lib/filtering.ts';
import { FRESHNESS_POLL_MS, hasNewerRun, pollStatus } from './lib/freshness.ts';
import type { AppGroup, GroupFilters, Listing, SortKey } from './lib/groups.ts';
import {
  buildGroups,
  DEFAULT_GROUP_FILTERS,
  filterGroups,
  findByListingId,
  hasActiveGroupFilters,
  isGroupRecent,
  isGroupWatched,
  visibleCollections,
} from './lib/groups.ts';
import { createLocalAppsStore, makeLocalApp } from './lib/localApps.ts';
import type { LocalApp } from './lib/localApps.ts';
import { prefersReducedMotion, supportsViewTransitions, transition } from './lib/motion.ts';
import { readPref, writePref } from './lib/prefs.ts';
import { applyTheme, currentTheme, persistTheme } from './lib/theme.ts';
import type { ThemeId } from './lib/theme.ts';
import { themeReveal } from './lib/motion.ts';
import { buildTimeline } from './lib/timeline.ts';
import { createWatchlist } from './lib/watchlist.ts';
import { parseStoreInput, storeUrlFor } from './shared/storeRefs.ts';
import type { AppRecord, HistoryFile, Platform, StatusFile } from './shared/types.ts';
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

type View = 'apps' | 'updates';

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface Selection {
  listingId: string;
  closing: boolean;
  morphing: boolean;
}

const INSIGHTS_PREF_KEY = 'appwatch:insights-open:v1';
const VIEW_PREF_KEY = 'appwatch:view:v1';
const HERO = 'hero-icon';
const CLOSE_MS = 240;

const SORT_OPTIONS: { value: SortKey; label: string; description: string }[] = [
  { value: 'updated', label: 'Latest update', description: 'Most recent release first' },
  { value: 'name', label: 'Name', description: 'A to Z' },
  { value: 'collection', label: 'Collection', description: 'Grouped like the tabs' },
];

function readHashListingId(): string | null {
  const match = /^#app=(.+)$/.exec(location.hash);
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

function pathWithoutHash(): string {
  return location.pathname + location.search;
}

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

/** An element is worth morphing to/from only when it is on screen. */
function onScreen(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < innerHeight && rect.width > 0;
}

function cardIconFor(groupKey: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.card[data-group="${CSS.escape(groupKey)}"] .card__icon`,
  );
}

function setVtName(el: HTMLElement | null | undefined, name: string): void {
  if (el) el.style.viewTransitionName = name;
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [filters, setFilters] = useState<GroupFilters>(DEFAULT_GROUP_FILTERS);
  const [view, setView] = useState<View>(() =>
    readPref(VIEW_PREF_KEY) === 'updates' ? 'updates' : 'apps',
  );
  const [theme, setTheme] = useState<ThemeId>(currentTheme);
  const [selection, setSelection] = useState<Selection | null>(() => {
    const id = readHashListingId();
    return id ? { listingId: id, closing: false, morphing: false } : null;
  });
  const [historyLoad, setHistoryLoad] = useState<HistoryLoad>({ phase: 'idle' });
  const [insightsOpen, setInsightsOpen] = useState(() => readPref(INSIGHTS_PREF_KEY) === '1');
  const [discovery, setDiscovery] = useState<DiscoveryState>({ phase: 'idle' });
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [intro, setIntro] = useState(true);

  const searchRef = useRef<HTMLInputElement>(null);
  const detailTrigger = useRef<HTMLElement | null>(null);
  const pushedDetail = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const refreshing = useRef(false);

  const watchlist = useMemo(() => createWatchlist(), []);
  const [watchedIds, setWatchedIds] = useState<ReadonlySet<string>>(() => watchlist.ids());

  const localStore = useMemo(() => createLocalAppsStore(), []);
  const [localApps, setLocalApps] = useState<LocalApp[]>(() => localStore.list());

  const showToast = useCallback((text: string, action?: Toast['action']) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 7000 : 5000);
  }, []);

  /**
   * Load the dashboard data. A soft refresh (used when the freshness poll
   * sees a newer deployed check) swaps the data in place — filters, scroll
   * position and an open detail panel are kept — and briefly confirms it.
   */
  const fetchData = useCallback(
    (soft = false) => {
      if (soft && refreshing.current) return;
      refreshing.current = true;
      if (!soft) setLoad({ phase: 'loading' });
      loadDashboardData()
        .then(({ apps, status }) => {
          const apply = () => {
            setLoad({ phase: 'ready', apps: apps.apps, status });
            // Version history is cached lazily; refetch it with the new data.
            if (soft) setHistoryLoad({ phase: 'idle' });
          };
          if (soft) {
            void transition('grid', apply);
            const updates = status?.updatesDetected ?? 0;
            showToast(
              `Updated with the latest check${
                updates > 0 ? ` · ${updates} new release${updates === 1 ? '' : 's'}` : ''
              }.`,
            );
          } else {
            apply();
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
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, [fetchData]);

  // The staggered entrance runs once, when the first data arrives.
  useEffect(() => {
    if (load.phase !== 'ready' || !intro) return;
    const timer = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(timer);
  }, [load.phase, intro]);

  const needsHistory = selection !== null || view === 'updates';
  useEffect(() => {
    if (!needsHistory || historyLoad.phase !== 'idle') return;
    setHistoryLoad({ phase: 'loading' });
    loadHistory()
      .then((file) => setHistoryLoad({ phase: 'ready', file }))
      .catch(() => setHistoryLoad({ phase: 'error' }));
  }, [needsHistory, historyLoad.phase]);

  // Deploy freshness: while the page is visible, revalidate the site's own
  // status.json every few minutes (and whenever the tab regains focus). When
  // the scheduled checker has deployed a newer run, the new data is applied
  // automatically. This never contacts the stores from the visitor's browser.
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

  const filteredGroups = useMemo(
    () => filterGroups(groups, filters, watchedIds, collectionOrder),
    [groups, filters, watchedIds, collectionOrder],
  );
  const recentCount = useMemo(() => groups.filter((g) => isGroupRecent(g)).length, [groups]);

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

  const found = selection ? findByListingId(groups, selection.listingId) : null;

  /* ------------------------------- Actions -------------------------------- */

  const updateFilters = useCallback((next: Partial<GroupFilters>, animate = true) => {
    const apply = () => setFilters((prev) => ({ ...prev, ...next }));
    if (animate) void transition('grid', apply);
    else apply();
  }, []);

  const clearFilters = useCallback(() => {
    void transition('grid', () => {
      setFilters(DEFAULT_GROUP_FILTERS);
      setDiscovery({ phase: 'idle' });
    });
  }, []);

  const changeView = useCallback(
    (next: View) => {
      if (next === view) return;
      writePref(VIEW_PREF_KEY, next);
      document.documentElement.dataset.vtDir = next === 'updates' ? 'forward' : 'back';
      void transition('view', () => setView(next));
    },
    [view],
  );

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

  const toggleInsights = useCallback(() => {
    setInsightsOpen((open) => {
      writePref(INSIGHTS_PREF_KEY, open ? '0' : '1');
      return !open;
    });
  }, []);

  const removeLocalGroup = useCallback(
    (group: AppGroup) => {
      const removed = localApps.filter((local) => group.listings.some((l) => l.id === local.id));
      let list = localApps;
      for (const local of removed) list = localStore.remove(local.id);
      void transition('grid', () => setLocalApps(list));
      showToast(`Stopped watching ${group.name}.`, {
        label: 'Undo',
        run: () => {
          let restored = localStore.list();
          for (const local of removed) restored = localStore.save(local);
          void transition('grid', () => setLocalApps(restored));
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

  /* ------------------------ Detail panel + deep links ---------------------- */

  const openDetail = useCallback(
    (listingId: string, trigger: HTMLElement | null, push = true) => {
      clearTimeout(closeTimer.current);
      if (trigger) detailTrigger.current = trigger;
      if (push) {
        try {
          history.pushState({ appwatch: 'detail' }, '', `#app=${encodeURIComponent(listingId)}`);
          pushedDetail.current = true;
        } catch {
          location.hash = `app=${encodeURIComponent(listingId)}`;
        }
      }
      const target = findByListingId(groups, listingId);
      const source = target ? cardIconFor(target.group.key) : null;
      const morph = supportsViewTransitions();
      const heroFrom = onScreen(source) ? source : null;
      setVtName(heroFrom, HERO);
      void transition(
        'detail',
        () => {
          setVtName(heroFrom, '');
          setSelection({ listingId, closing: false, morphing: morph });
        },
        undefined,
        {
          afterRender: () => {
            if (heroFrom) setVtName(document.querySelector<HTMLElement>('.detail__icon'), HERO);
          },
          finished: () => setVtName(document.querySelector<HTMLElement>('.detail__icon'), ''),
        },
      );
    },
    [groups],
  );

  const restoreFocus = useCallback((groupKey: string | null) => {
    const trigger = detailTrigger.current;
    detailTrigger.current = null;
    const fallback = groupKey
      ? document.querySelector<HTMLElement>(
          `.card[data-group="${CSS.escape(groupKey)}"] .card__open`,
        )
      : null;
    const target = trigger && document.contains(trigger) ? trigger : fallback;
    target?.focus({ preventScroll: true });
  }, []);

  /** Animate the panel away. Called for UI closes and for Back navigation. */
  const dismissDetail = useCallback(() => {
    const groupKey = found?.group.key ?? null;
    if (supportsViewTransitions()) {
      const detailIcon = document.querySelector<HTMLElement>('.detail__icon');
      const cardIcon = groupKey ? cardIconFor(groupKey) : null;
      const morph = onScreen(detailIcon) && onScreen(cardIcon);
      if (morph) setVtName(detailIcon, HERO);
      void transition('detail', () => setSelection(null), undefined, {
        afterRender: () => {
          if (morph && groupKey) setVtName(cardIconFor(groupKey), HERO);
          restoreFocus(groupKey);
        },
        finished: () => {
          if (groupKey) setVtName(cardIconFor(groupKey), '');
        },
      });
      return;
    }
    if (prefersReducedMotion()) {
      setSelection(null);
      requestAnimationFrame(() => restoreFocus(groupKey));
      return;
    }
    setSelection((current) => (current ? { ...current, closing: true } : current));
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setSelection(null);
      requestAnimationFrame(() => restoreFocus(groupKey));
    }, CLOSE_MS);
  }, [found, restoreFocus]);

  const closeDetail = useCallback(() => {
    if (
      pushedDetail.current &&
      (history.state as { appwatch?: string } | null)?.appwatch === 'detail'
    ) {
      // Popping our own history entry keeps Back/Forward honest; the
      // popstate handler below runs the close animation.
      history.back();
      return;
    }
    try {
      history.replaceState(null, '', pathWithoutHash());
    } catch {
      location.hash = '';
    }
    dismissDetail();
  }, [dismissDetail]);

  // Back/Forward and hand-edited #app= links.
  useEffect(() => {
    const onPop = () => {
      const id = readHashListingId();
      if (id) {
        if (id !== selection?.listingId) openDetail(id, null, false);
      } else if (selection) {
        pushedDetail.current = false;
        dismissDetail();
      }
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [selection, openDetail, dismissDetail]);

  const selectListing = useCallback((listingId: string) => {
    try {
      history.replaceState(history.state, '', `#app=${encodeURIComponent(listingId)}`);
    } catch {
      // Ignore: the panel still switches.
    }
    setSelection((current) => (current ? { ...current, listingId } : current));
  }, []);

  // The page behind the dialog is inert and doesn't scroll.
  const dialogOpen = selection !== null && found !== null;
  useEffect(() => {
    document.documentElement.classList.toggle('has-dialog', dialogOpen);
  }, [dialogOpen]);

  // A deep link to an unknown app just clears itself once data is in.
  useEffect(() => {
    if (load.phase === 'ready' && selection && !found) {
      setSelection(null);
      try {
        history.replaceState(null, '', pathWithoutHash());
      } catch {
        // Ignore.
      }
    }
  }, [load.phase, selection, found]);

  /* ------------------------------- Discovery ------------------------------ */

  const parsedRef = useMemo(() => parseStoreInput(filters.query), [filters.query]);

  const submitSearch = useCallback(() => {
    const input = filters.query.trim();
    if (input.length < 2) return;
    if (view !== 'apps') changeView('apps');
    if (parsedRef && knownIds.has(appId(parsedRef.platform, parsedRef.storeId))) return;
    if (parsedRef?.platform === 'google') return; // the panel offers a local watch; nothing to fetch
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
      const list = localStore.save(discoveredToLocal(app));
      void transition('grid', () => setLocalApps(list));
      showToast(`Watching ${app.name} in this browser.`);
    },
    [localStore, showToast],
  );

  const addUnresolved = useCallback(
    (ref: { platform: Platform; storeId: string; country?: string }) => {
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
      void transition('grid', () => setLocalApps(list));
      showToast(`Watching ${ref.storeId} in this browser.`);
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

  const focusSearch = useCallback(() => {
    const input = searchRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  // "/" jumps to search from anywhere that isn't a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.documentElement.classList.contains('has-dialog')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      focusSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focusSearch]);

  /* -------------------------------- Render -------------------------------- */

  const ready = load.phase === 'ready';
  const active = hasActiveGroupFilters(filters);
  const localGroupCount = groups.filter((g) => g.source === 'local').length;
  const trackedGroupCount = groups.length - localGroupCount;

  const collectionTabs = [
    { value: 'all', label: 'All', count: groups.length },
    ...collections.map((c) => ({ value: c.id, label: c.label, count: c.count })),
  ];

  const selectedLocal =
    found?.listing.source === 'local'
      ? (localApps.find((local) => local.id === found.listing.id) ?? null)
      : null;

  return (
    <>
      <div class="layout" id="top" inert={dialogOpen}>
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
          <section class="hero" aria-labelledby="hero-title">
            <h1 class="hero__title" id="hero-title">
              <span class="hero__line">Every app update,</span>{' '}
              <span class="hero__line hero__line--accent">in one place.</span>
            </h1>
            <p class="hero__sub">
              AppWatch follows {ready ? trackedGroupCount : 'popular'} apps across the{' '}
              <span class="hero__store hero__store--apple">App Store</span> and{' '}
              <span class="hero__store hero__store--google">Google Play</span>, checks them every
              two hours, and keeps every release’s notes.
            </p>
            {ready && recentCount > 0 ? (
              <button
                type="button"
                class={`hero__pulse${filters.recentOnly ? ' is-active' : ''}`}
                aria-pressed={filters.recentOnly}
                onClick={() => {
                  if (view !== 'apps') changeView('apps');
                  updateFilters({ recentOnly: !filters.recentOnly });
                }}
              >
                <span class="hero__pulse-dot" aria-hidden="true" />
                {recentCount} app{recentCount === 1 ? '' : 's'} updated in the last {RECENT_DAYS}{' '}
                days
              </button>
            ) : null}
          </section>

          {ready && isDataStale(status) ? (
            <p class="notice notice--warn" role="status">
              The last completed check was more than {STALE_AFTER_HOURS} hours ago — this data may
              be out of date.
            </p>
          ) : null}
          {ready && !watchlist.persistent && (watchedIds.size > 0 || localApps.length > 0) ? (
            <p class="notice" role="status">
              Browser storage is unavailable, so watches added here will reset when you leave.
            </p>
          ) : null}

          <div class="controls">
            <div class="controls__top">
              <SlidingTabs
                class="view-switch"
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
                  updateFilters({ query }, false);
                  setDiscovery({ phase: 'idle' });
                }}
              />
            </div>
          </div>

          {ready ? (
            <div class="collections">
              <SlidingTabs
                class="collections__tabs"
                variant="underline"
                role="radiogroup"
                label="Collections"
                value={filters.collection}
                onChange={(collection) => updateFilters({ collection })}
                items={collectionTabs}
              />
            </div>
          ) : null}

          {ready ? (
            <div class="filters-area">
              <div class="filters">
                <SlidingTabs
                  class="store-switch"
                  variant="pill"
                  role="radiogroup"
                  label="Store"
                  value={filters.platform}
                  onChange={(platform) => updateFilters({ platform })}
                  items={[
                    { value: 'all', label: 'Both stores' },
                    {
                      value: 'apple',
                      label: 'App Store',
                      icon: <span class="dot dot--apple" aria-hidden="true" />,
                    },
                    {
                      value: 'google',
                      label: 'Google Play',
                      icon: <span class="dot dot--google" aria-hidden="true" />,
                    },
                  ]}
                />
                {view === 'apps' ? (
                  <button
                    type="button"
                    class={`chip${filters.recentOnly ? ' is-on' : ''}`}
                    aria-pressed={filters.recentOnly}
                    onClick={() => updateFilters({ recentOnly: !filters.recentOnly })}
                  >
                    <span class="chip__check" aria-hidden="true">
                      <CheckIcon size={12} />
                    </span>
                    This week
                  </button>
                ) : null}
                <button
                  type="button"
                  class={`chip${filters.watchedOnly ? ' is-on' : ''}`}
                  aria-pressed={filters.watchedOnly}
                  onClick={() => updateFilters({ watchedOnly: !filters.watchedOnly })}
                >
                  <span class="chip__check" aria-hidden="true">
                    <CheckIcon size={12} />
                  </span>
                  Watching
                </button>
                <span class="filters__spacer" />
                {view === 'apps' ? (
                  <Dropdown
                    label="Sort apps"
                    options={SORT_OPTIONS}
                    value={filters.sort}
                    onChange={(sort) => updateFilters({ sort })}
                    align="end"
                    buttonContent={
                      <>
                        <span class="dropdown__prefix">Sort</span>
                        {SORT_OPTIONS.find((o) => o.value === filters.sort)?.label}
                      </>
                    }
                  />
                ) : null}
              </div>
              <p class="results" aria-live="polite">
                {view === 'apps'
                  ? `${filteredGroups.length} of ${groups.length} apps`
                  : historyLoad.phase === 'ready'
                    ? `${timeline.length} recorded release${timeline.length === 1 ? '' : 's'}`
                    : 'Loading release history…'}
                {active ? (
                  <button type="button" class="results__clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
              </p>
            </div>
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
                  <NoResults onClear={clearFilters} searching={filters.query.trim().length > 1} />
                ) : (
                  <div class={`grid${intro ? ' grid--intro' : ''}`}>
                    {filteredGroups.map((group, index) => (
                      <AppCard
                        key={group.key}
                        group={group}
                        index={index}
                        watched={isGroupWatched(group, watchedIds)}
                        open={found?.group.key === group.key}
                        onToggleWatch={toggleWatch}
                        onOpen={openDetail}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {ready && view === 'updates' ? (
              historyLoad.phase === 'ready' ? (
                <UpdatesTimeline
                  events={timeline}
                  onOpen={openDetail}
                  onClearFilters={clearFilters}
                  filtered={active}
                />
              ) : historyLoad.phase === 'error' ? (
                <LoadFailed
                  message="Release history could not be loaded."
                  onRetry={() => setHistoryLoad({ phase: 'idle' })}
                />
              ) : (
                <div class="timeline timeline--loading" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span class="skeleton skeleton--release" key={i} />
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
              open={insightsOpen}
              onToggle={toggleInsights}
            />
          ) : null}
        </main>

        <Footer />
      </div>

      {selection && found ? (
        <AppDetail
          group={found.group}
          listing={found.listing}
          collectionLabel={collectionLabels.get(found.group.collection) ?? null}
          history={historyFor(historyLoad, found.listing.id)}
          watched={isGroupWatched(found.group, watchedIds)}
          closing={selection.closing}
          morphing={selection.morphing}
          onSelectListing={selectListing}
          onToggleWatch={() => toggleWatch(found.group)}
          onClose={closeDetail}
          onRefreshLocal={selectedLocal ? refreshLocal : undefined}
          localRefreshing={localRefreshing}
          localAddedAt={selectedLocal?.addedAt ?? null}
        />
      ) : null}

      {toast ? (
        <div
          class="toast"
          role="status"
          key={toast.id}
          style={{ '--toast-ms': `${toast.action ? 7000 : 5000}ms` }}
        >
          <span class="toast__text">{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              class="toast__action"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button
            type="button"
            class="icon-button icon-button--small"
            aria-label="Dismiss"
            onClick={() => setToast(null)}
          >
            <CloseIcon size={14} />
          </button>
          <span class="toast__timer" aria-hidden="true" />
        </div>
      ) : null}
    </>
  );
}
