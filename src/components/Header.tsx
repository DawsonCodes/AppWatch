import type { StatusFile } from '../shared/types.ts';
import { formatDateTime, relativeTime } from '../lib/format.ts';
import type { ThemeId } from '../lib/theme.ts';
import { THEMES } from '../lib/theme.ts';
import { Dropdown } from './Dropdown.tsx';
import { GitHubIcon, LogoIcon, PaletteIcon } from './Icons.tsx';

interface HeaderProps {
  status: StatusFile | null;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId, origin: HTMLElement | null) => void;
  shortVersions: boolean;
  onShortVersionsChange: (on: boolean) => void;
}

/** An on/off row for the theme menu. */
function SwitchRow({
  label,
  description,
  on,
  onToggle,
}: {
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} class="switch-row" onClick={onToggle}>
      <span class="switch-row__text">
        <span class="switch-row__label">{label}</span>
        <span class="switch-row__desc">{description}</span>
      </span>
      <span class={`switch${on ? ' is-on' : ''}`} aria-hidden="true">
        <span class="switch__thumb" />
      </span>
    </button>
  );
}

/** Compact check-health chip: a dot plus short text, never color alone. */
function HealthChip({ status }: { status: StatusFile | null }) {
  if (!status?.lastRunAt) {
    return (
      <span class="health health--unknown" title="The scheduled checker has not run yet">
        <span class="health__dot" aria-hidden="true" />
        <span class="health__text">Not checked yet</span>
      </span>
    );
  }
  const when = relativeTime(status.lastRunAt) ?? 'recently';
  const exact = formatDateTime(status.lastRunAt) ?? '';
  if (status.errorCount > 0) {
    return (
      <span
        class="health health--warn"
        title={`${status.errorCount} of ${status.totalApps} checks failed · last run ${exact}`}
      >
        <span class="health__dot" aria-hidden="true" />
        <span class="health__text">
          {status.errorCount} failing<span class="health__long"> · {when}</span>
        </span>
      </span>
    );
  }
  return (
    <span class="health health--ok" title={`All ${status.totalApps} checks passing · ${exact}`}>
      <span class="health__dot" aria-hidden="true" />
      <span class="health__text">
        <span class="health__long">Checked </span>
        {when}
      </span>
    </span>
  );
}

export function Header({
  status,
  theme,
  onThemeChange,
  shortVersions,
  onShortVersionsChange,
}: HeaderProps) {
  const current = THEMES.find((option) => option.id === theme);
  return (
    <header class="site-header">
      <div class="site-header__inner">
        <a class="brand" href="#" aria-label="AppWatch home">
          <LogoIcon size={28} />
          <span class="brand__name">
            <span class="brand__app">App</span>
            <span class="brand__watch">Watch</span>
          </span>
        </a>

        <HealthChip status={status} />

        <div class="site-header__actions">
          <Dropdown
            label="Theme"
            options={THEMES.map(({ id, label, description }) => ({
              value: id,
              label,
              description,
              icon: <span class={`swatch swatch--${id}`} aria-hidden="true" />,
            }))}
            value={theme}
            onChange={onThemeChange}
            align="end"
            buttonClass="dropdown__button--theme"
            footer={
              <SwitchRow
                label="Short version numbers"
                description="26.19 instead of 26.19.0+rc3-2026…"
                on={shortVersions}
                onToggle={() => onShortVersionsChange(!shortVersions)}
              />
            }
            buttonContent={
              <>
                <PaletteIcon size={16} />
                <span class="theme-label">{current?.label ?? 'Theme'}</span>
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
