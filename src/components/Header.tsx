import type { StatusFile } from '../shared/types.ts';
import { relativeTime } from '../lib/format.ts';
import { GitHubIcon, LogoIcon, MoonIcon, SearchIcon, SunIcon } from './Icons.tsx';

export type Theme = 'dark' | 'light';

interface HeaderProps {
  query: string;
  onQueryChange: (query: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
  status: StatusFile | null;
}

function CheckStatusPill({ status }: { status: StatusFile | null }) {
  if (!status || !status.lastRunAt) {
    return (
      <span class="status-pill status-pill--unknown" title="The scheduled checker has not run yet">
        <span class="status-dot" aria-hidden="true" />
        Awaiting first check
      </span>
    );
  }
  const when = relativeTime(status.lastRunAt) ?? 'recently';
  if (status.errorCount > 0) {
    return (
      <span
        class="status-pill status-pill--warn"
        title={`${status.errorCount} of ${status.totalApps} checks failed`}
      >
        <span class="status-dot" aria-hidden="true" />
        {status.errorCount} check{status.errorCount === 1 ? '' : 's'} failing · {when}
      </span>
    );
  }
  return (
    <span class="status-pill status-pill--ok" title={`Last checked ${when}`}>
      <span class="status-dot" aria-hidden="true" />
      Checks passing · {when}
    </span>
  );
}

export function Header({ query, onQueryChange, theme, onToggleTheme, status }: HeaderProps) {
  return (
    <header class="site-header">
      <div class="site-header__inner">
        <a class="brand" href="#top" aria-label="AppWatch — back to top">
          <LogoIcon size={30} />
          <span class="brand__name">AppWatch</span>
        </a>

        <div class="site-header__status">
          <CheckStatusPill status={status} />
        </div>

        <div class="site-header__search" role="search">
          <label class="search-field">
            <span class="visually-hidden">Search apps by name or developer</span>
            <SearchIcon size={16} />
            <input
              type="search"
              placeholder="Search apps or developers…"
              value={query}
              onInput={(event) => onQueryChange((event.target as HTMLInputElement).value)}
              autocomplete="off"
            />
          </label>
        </div>

        <div class="site-header__actions">
          <button
            type="button"
            class="icon-button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <a
            class="icon-button"
            href="https://github.com/DawsonCodes/AppWatch"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="AppWatch on GitHub (opens in a new tab)"
            title="AppWatch on GitHub"
          >
            <GitHubIcon size={18} />
          </a>
        </div>
      </div>
    </header>
  );
}
