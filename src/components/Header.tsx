import type { StatusFile } from '../shared/types.ts';
import { relativeTime } from '../lib/format.ts';
import type { ThemeId } from '../lib/theme.ts';
import { THEMES } from '../lib/theme.ts';
import { Dropdown } from './Dropdown.tsx';
import { GitHubIcon, LogoIcon, PaletteIcon, SearchIcon } from './Icons.tsx';

interface HeaderProps {
  status: StatusFile | null;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  onSearchJump: () => void;
}

/** Compact check-health chip: a dot plus short text, never color alone. */
function HealthChip({ status }: { status: StatusFile | null }) {
  if (!status?.lastRunAt) {
    return (
      <span class="health health--unknown" title="The scheduled checker has not run yet">
        <span class="health__dot" aria-hidden="true" />
        <span class="health__text">No checks yet</span>
      </span>
    );
  }
  const when = relativeTime(status.lastRunAt) ?? 'recently';
  if (status.errorCount > 0) {
    return (
      <span
        class="health health--warn"
        title={`${status.errorCount} of ${status.totalApps} checks failed · last run ${when}`}
      >
        <span class="health__dot" aria-hidden="true" />
        <span class="health__text">
          {status.errorCount} failing <span class="health__when">· {when}</span>
        </span>
      </span>
    );
  }
  return (
    <span class="health health--ok" title={`All checks passing · last run ${when}`}>
      <span class="health__dot" aria-hidden="true" />
      <span class="health__text">
        Checks OK <span class="health__when">· {when}</span>
      </span>
    </span>
  );
}

export function Header({ status, theme, onThemeChange, onSearchJump }: HeaderProps) {
  const currentTheme = THEMES.find((option) => option.id === theme);
  return (
    <header class="site-header">
      <div class="site-header__inner">
        <a class="brand" href="#top" aria-label="AppWatch — back to top">
          <LogoIcon size={26} />
          <span class="brand__name">
            <span class="brand__app">App</span>
            <span class="brand__watch">Watch</span>
          </span>
        </a>

        <HealthChip status={status} />

        <div class="site-header__actions">
          <button
            type="button"
            class="icon-button"
            aria-label="Jump to search"
            title="Search apps"
            onClick={onSearchJump}
          >
            <SearchIcon size={17} />
          </button>
          <Dropdown
            label="Theme"
            options={THEMES.map(({ id, label, description }) => ({
              value: id,
              label,
              description,
            }))}
            value={theme}
            onChange={onThemeChange}
            align="end"
            buttonClass="dropdown__button--icon"
            buttonContent={
              <>
                <PaletteIcon size={16} />
                <span class="theme-label">{currentTheme?.label ?? 'Theme'}</span>
              </>
            }
          />
          <a
            class="icon-button"
            href="https://github.com/DawsonCodes/AppWatch"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="AppWatch on GitHub (opens in a new tab)"
            title="AppWatch on GitHub"
          >
            <GitHubIcon size={17} />
          </a>
        </div>
      </div>
    </header>
  );
}
