// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readJsonPref, readPref, writeJsonPref, writePref } from '../src/lib/prefs.ts';

describe('prefs with working storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips string preferences (e.g. the insights panel state)', () => {
    expect(readPref('appwatch:insights-open:v1')).toBeNull();
    writePref('appwatch:insights-open:v1', '1');
    expect(readPref('appwatch:insights-open:v1')).toBe('1');
    writePref('appwatch:insights-open:v1', '0');
    expect(readPref('appwatch:insights-open:v1')).toBe('0');
  });

  it('round-trips JSON preferences and rejects corrupt payloads', () => {
    writeJsonPref('appwatch:test', { a: 1 });
    expect(readJsonPref('appwatch:test')).toEqual({ a: 1 });
    localStorage.setItem('appwatch:test', '{broken');
    expect(readJsonPref('appwatch:test')).toBeNull();
  });
});

describe('prefs when storage throws', () => {
  it('never propagates storage exceptions', () => {
    const spyGet = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    const spySet = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => writePref('k', 'v')).not.toThrow();
    expect(readPref('k')).toBeNull();
    expect(readJsonPref('k')).toBeNull();
    expect(() => writeJsonPref('k', [1])).not.toThrow();
    spyGet.mockRestore();
    spySet.mockRestore();
  });
});
