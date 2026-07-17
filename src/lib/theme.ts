/**
 * The AppWatch theme system. Three complete themes, persisted locally.
 * First visit follows the operating-system light/dark preference; MS Paint is
 * only ever active because the visitor chose it.
 *
 * public/theme-init.js applies the same resolution logic before first paint —
 * keep the two in sync when changing behavior here.
 */

import { readPref, writePref } from './prefs.ts';

export type ThemeId = 'gray-dark' | 'light' | 'ms-paint';

export const THEME_STORAGE_KEY = 'appwatch:theme';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEMES: readonly ThemeOption[] = [
  { id: 'gray-dark', label: 'Gray Dark', description: 'Neutral charcoal, blue accent' },
  { id: 'light', label: 'Light', description: 'Clean light gray and white' },
  { id: 'ms-paint', label: 'MS Paint', description: 'Classic desktop paint tribute' },
];

/** Page background per theme, used for the browser UI theme-color. */
const THEME_COLORS: Record<ThemeId, string> = {
  'gray-dark': '#17191d',
  light: '#f4f5f7',
  'ms-paint': '#c0c0c0',
};

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'gray-dark' || value === 'light' || value === 'ms-paint';
}

/**
 * Decide which theme to apply on load.
 *  - A saved AppWatch theme always wins ("dark" is migrated from v1.0).
 *  - Otherwise the OS preference picks Gray Dark or Light.
 *  - MS Paint is never selected automatically.
 */
export function resolveInitialTheme(saved: string | null, prefersLight: boolean): ThemeId {
  if (isThemeId(saved)) return saved;
  if (saved === 'dark') return 'gray-dark';
  return prefersLight ? 'light' : 'gray-dark';
}

export function currentTheme(): ThemeId {
  const value = document.documentElement.getAttribute('data-theme');
  return isThemeId(value) ? value : 'gray-dark';
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export function persistTheme(theme: ThemeId): void {
  writePref(THEME_STORAGE_KEY, theme);
}

export function loadSavedTheme(): string | null {
  return readPref(THEME_STORAGE_KEY);
}
