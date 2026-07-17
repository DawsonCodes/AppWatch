// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  currentTheme,
  isThemeId,
  loadSavedTheme,
  persistTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from '../src/lib/theme.ts';

describe('resolveInitialTheme', () => {
  it('honors a saved AppWatch theme', () => {
    expect(resolveInitialTheme('gray-dark', true)).toBe('gray-dark');
    expect(resolveInitialTheme('light', false)).toBe('light');
    expect(resolveInitialTheme('ms-paint', false)).toBe('ms-paint');
  });

  it('migrates the legacy v1.0 "dark" value to gray-dark', () => {
    expect(resolveInitialTheme('dark', true)).toBe('gray-dark');
  });

  it('falls back to the OS preference when nothing is saved', () => {
    expect(resolveInitialTheme(null, true)).toBe('light');
    expect(resolveInitialTheme(null, false)).toBe('gray-dark');
    expect(resolveInitialTheme('garbage', true)).toBe('light');
  });

  it('never selects MS Paint automatically', () => {
    expect(resolveInitialTheme(null, false)).not.toBe('ms-paint');
    expect(resolveInitialTheme(null, true)).not.toBe('ms-paint');
    expect(resolveInitialTheme('dark', false)).not.toBe('ms-paint');
  });
});

describe('isThemeId', () => {
  it('accepts only the three real themes', () => {
    expect(isThemeId('gray-dark')).toBe(true);
    expect(isThemeId('light')).toBe(true);
    expect(isThemeId('ms-paint')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });
});

describe('applyTheme / currentTheme / persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  });

  it('applies the data-theme attribute and matching theme-color', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#f4f5f7',
    );
    expect(currentTheme()).toBe('light');
  });

  it('round-trips the persisted choice', () => {
    persistTheme('ms-paint');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('ms-paint');
    expect(loadSavedTheme()).toBe('ms-paint');
    expect(resolveInitialTheme(loadSavedTheme(), false)).toBe('ms-paint');
  });

  it('falls back to gray-dark when the attribute is missing or bogus', () => {
    expect(currentTheme()).toBe('gray-dark');
    document.documentElement.setAttribute('data-theme', 'nonsense');
    expect(currentTheme()).toBe('gray-dark');
  });
});
