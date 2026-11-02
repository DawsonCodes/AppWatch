/**
 * Routes each desktop listing to the provider for its source: winget for
 * "winget:" Windows listings, Homebrew for "homebrew:" Mac listings, Steam
 * for "steam:" games, and a release feed (e.g. Respondus) for feed ids. See
 * src/shared/desktop.ts.
 */

import { desktopSourceFor } from '../../../src/shared/desktop.ts';
import type { TrackTarget } from '../config.ts';
import type { ProviderFetch } from './types.ts';
import { ProviderError } from './types.ts';

export function createDesktopRouter(providers: {
  winget?: ProviderFetch;
  homebrew?: ProviderFetch;
  steam?: ProviderFetch;
  /** Release feeds by feed id. */
  feeds?: Readonly<Record<string, ProviderFetch>>;
}): ProviderFetch {
  return (target: TrackTarget) => {
    const source = desktopSourceFor(target.platform, target.storeId);
    const provider = !source
      ? undefined
      : source.kind === 'feed'
        ? providers.feeds?.[source.feed.id]
        : providers[source.kind];
    if (!source || !provider) {
      throw new ProviderError(`No checker for ${target.platform} listing "${target.storeId}"`);
    }
    return provider(target);
  };
}
