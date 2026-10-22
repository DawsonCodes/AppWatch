/**
 * Routes each desktop listing to the provider for its source: winget for
 * "winget:" Windows listings, Homebrew for "homebrew:" Mac listings, and a
 * vendor release feed (e.g. Respondus) for feed ids. See src/shared/desktop.ts.
 */

import { desktopSourceFor } from '../../../src/shared/desktop.ts';
import type { TrackTarget } from '../config.ts';
import type { ProviderFetch } from './types.ts';
import { ProviderError } from './types.ts';

export function createDesktopRouter(providers: {
  winget?: ProviderFetch;
  homebrew?: ProviderFetch;
  feed?: ProviderFetch;
}): ProviderFetch {
  return (target: TrackTarget) => {
    const source = desktopSourceFor(target.platform, target.storeId);
    const provider = source ? providers[source.kind] : undefined;
    if (!source || !provider) {
      throw new ProviderError(`No checker for ${target.platform} listing "${target.storeId}"`);
    }
    return provider(target);
  };
}
