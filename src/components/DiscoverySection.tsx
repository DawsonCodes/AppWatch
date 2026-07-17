import type { StoreRef } from '../shared/storeRefs.ts';
import { appId } from '../shared/types.ts';
import type { DiscoveredApp, DiscoveryOutcome } from '../lib/discovery.ts';
import { externalSearchLinks, externalStoreLink } from '../lib/discovery.ts';
import { formatCount } from '../lib/format.ts';
import { AppIcon } from './AppIcon.tsx';
import { CheckIcon, ExternalIcon, PlusIcon } from './Icons.tsx';

export type DiscoveryState =
  | { phase: 'idle' }
  | { phase: 'loading'; input: string }
  | { phase: 'done'; input: string; outcome: DiscoveryOutcome };

interface DiscoverySectionProps {
  query: string;
  parsedRef: StoreRef | null;
  knownIds: ReadonlySet<string>;
  state: DiscoveryState;
  onLookup: () => void;
  onAddDiscovered: (app: DiscoveredApp) => void;
  onAddUnresolved: (ref: StoreRef) => void;
}

function DiscoveredRow({
  app,
  known,
  onAdd,
}: {
  app: DiscoveredApp;
  known: boolean;
  onAdd: (app: DiscoveredApp) => void;
}) {
  const ratingText =
    app.rating !== null
      ? `${app.rating.toFixed(1)}★${app.ratingCount ? ` (${formatCount(app.ratingCount)})` : ''}`
      : null;
  return (
    <li class="discovered">
      <AppIcon name={app.name} iconUrl={app.iconUrl} size={40} />
      <div class="discovered__text">
        <span class="discovered__name">{app.name}</span>
        <span class="discovered__meta">
          {[app.developer, app.version ? `v${app.version}` : null, app.price, ratingText]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div class="discovered__actions">
        {known ? (
          <span class="discovered__added">
            <CheckIcon size={13} /> Watching
          </span>
        ) : (
          <button type="button" class="button button--primary" onClick={() => onAdd(app)}>
            <PlusIcon size={13} /> Watch
          </button>
        )}
        <a
          class="icon-button"
          href={app.storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${app.name} on the App Store (opens in a new tab)`}
        >
          <ExternalIcon size={14} />
        </a>
      </div>
    </li>
  );
}

/**
 * Store-wide discovery, honestly scoped:
 *  - App Store listings resolve live in the browser (when Apple's public
 *    lookup endpoint is reachable cross-origin).
 *  - Google Play offers no browser-readable API, so Play refs can be watched
 *    locally with a store link, and name searches fall back to an external
 *    Play search link. Nothing is faked, nothing is proxied.
 */
export function DiscoverySection({
  query,
  parsedRef,
  knownIds,
  state,
  onLookup,
  onAddDiscovered,
  onAddUnresolved,
}: DiscoverySectionProps) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const refKnown = parsedRef !== null && knownIds.has(appId(parsedRef.platform, parsedRef.storeId));
  const stale = state.phase !== 'idle' && state.input !== trimmed;
  const links = externalSearchLinks(trimmed);

  // A pasted ref that is already shown above needs no discovery UI.
  if (refKnown) return null;

  return (
    <section class="discovery" aria-label="Store discovery">
      {parsedRef === null ? (
        <>
          {state.phase === 'idle' || stale ? (
            <p class="discovery__hint">
              Looking for something that isn’t listed? Press <kbd>Enter</kbd> to search the App
              Store, or{' '}
              <a href={links.google} target="_blank" rel="noopener noreferrer">
                search Google Play <ExternalIcon size={11} />
              </a>
              .
            </p>
          ) : null}
          {!stale && state.phase === 'loading' ? (
            <p class="discovery__hint" role="status">
              Searching the App Store…
            </p>
          ) : null}
          {!stale && state.phase === 'done' ? (
            <div class="discovery__results" role="status">
              {state.outcome.kind === 'resolved' ? (
                <>
                  <h2 class="discovery__heading">From the App Store</h2>
                  <ul class="discovery__list">
                    {state.outcome.apps.map((app) => (
                      <DiscoveredRow
                        key={app.storeId}
                        app={app}
                        known={knownIds.has(appId('apple', app.storeId))}
                        onAdd={onAddDiscovered}
                      />
                    ))}
                  </ul>
                  <p class="discovery__note">
                    Apps you add here are watched <strong>only in this browser</strong> — the
                    repository’s scheduled checker doesn’t track them.{' '}
                    <a href={links.google} target="_blank" rel="noopener noreferrer">
                      Search Google Play instead <ExternalIcon size={11} />
                    </a>
                  </p>
                </>
              ) : state.outcome.kind === 'not-found' ? (
                <p class="discovery__hint">
                  Nothing matching “{trimmed}” on the App Store. Try{' '}
                  <a href={links.google} target="_blank" rel="noopener noreferrer">
                    Google Play <ExternalIcon size={11} />
                  </a>
                  .
                </p>
              ) : (
                <p class="discovery__hint">
                  {state.outcome.reason} You can still search the stores directly:{' '}
                  <a href={links.apple} target="_blank" rel="noopener noreferrer">
                    App Store <ExternalIcon size={11} />
                  </a>{' '}
                  ·{' '}
                  <a href={links.google} target="_blank" rel="noopener noreferrer">
                    Google Play <ExternalIcon size={11} />
                  </a>
                </p>
              )}
            </div>
          ) : null}
        </>
      ) : parsedRef.platform === 'apple' ? (
        <div class="discovery__results">
          {state.phase === 'loading' && !stale ? (
            <p class="discovery__hint" role="status">
              Looking up App Store ID {parsedRef.storeId}…
            </p>
          ) : state.phase === 'done' && !stale ? (
            state.outcome.kind === 'resolved' ? (
              <>
                <h2 class="discovery__heading">Found on the App Store</h2>
                <ul class="discovery__list">
                  {state.outcome.apps.slice(0, 1).map((app) => (
                    <DiscoveredRow
                      key={app.storeId}
                      app={app}
                      known={knownIds.has(appId('apple', app.storeId))}
                      onAdd={onAddDiscovered}
                    />
                  ))}
                </ul>
                <p class="discovery__note">
                  Added apps are watched <strong>only in this browser</strong>.
                </p>
              </>
            ) : state.outcome.kind === 'not-found' ? (
              <p class="discovery__hint">
                No App Store listing found for ID {parsedRef.storeId}.{' '}
                <a href={externalStoreLink(parsedRef)} target="_blank" rel="noopener noreferrer">
                  Check the store <ExternalIcon size={11} />
                </a>
              </p>
            ) : (
              <p class="discovery__hint">
                {state.outcome.reason}{' '}
                <button
                  type="button"
                  class="button button--ghost"
                  onClick={() => onAddUnresolved(parsedRef)}
                >
                  <PlusIcon size={12} /> Watch it anyway
                </button>{' '}
                <a
                  class="button button--ghost"
                  href={externalStoreLink(parsedRef)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the App Store <ExternalIcon size={11} />
                </a>
              </p>
            )
          ) : (
            <p class="discovery__hint">
              That looks like an App Store listing (ID {parsedRef.storeId}). Press <kbd>Enter</kbd>{' '}
              or{' '}
              <button type="button" class="button button--primary" onClick={onLookup}>
                Look it up
              </button>
            </p>
          )}
        </div>
      ) : (
        <div class="discovery__results">
          <p class="discovery__hint">
            That looks like a Google Play package (<code>{parsedRef.storeId}</code>). Google Play
            has no browser-readable metadata API, so AppWatch can’t fetch its details here — but you
            can watch it locally with a store link.
          </p>
          <p class="discovery__actions-row">
            <button
              type="button"
              class="button button--primary"
              onClick={() => onAddUnresolved(parsedRef)}
            >
              <PlusIcon size={13} /> Watch locally
            </button>
            <a
              class="button button--ghost"
              href={externalStoreLink(parsedRef)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Google Play <ExternalIcon size={12} />
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
