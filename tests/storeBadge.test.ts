import { describe, expect, it } from 'vitest';
import { listingLabel, shortUpdateTitle, splitUpdateTitle } from '../src/components/StoreBadge.tsx';

describe('listingLabel', () => {
  it('names Steam games "Steam" and everything else by platform', () => {
    expect(listingLabel({ platform: 'windows', storeId: 'steam:730' })).toBe('Steam');
    expect(listingLabel({ platform: 'windows', storeId: 'winget:Valve.Steam' })).toBe('Windows');
    expect(listingLabel({ platform: 'google', storeId: 'com.x' })).toBe('Google Play');
  });
});

describe('splitUpdateTitle', () => {
  it('splits the first line off as the title', () => {
    expect(splitUpdateTitle('Patch 2.31\n\nFixed a crash.\nMore.')).toEqual({
      title: 'Patch 2.31',
      body: 'Fixed a crash.\nMore.',
    });
    expect(splitUpdateTitle('Hotfix #36 Now Live!')).toEqual({
      title: 'Hotfix #36 Now Live!',
      body: null,
    });
  });

  it('leaves notes alone when there is no usable title', () => {
    expect(splitUpdateTitle(null)).toEqual({ title: null, body: null });
    const long = `${'x'.repeat(200)}\nrest`;
    expect(splitUpdateTitle(long)).toEqual({ title: null, body: long });
  });
});

describe('shortUpdateTitle', () => {
  it("drops the game's own name from the front", () => {
    expect(shortUpdateTitle('Counter-Strike 2 Update', 'Counter-Strike 2')).toBe('Update');
    expect(shortUpdateTitle('Apex Legends: Latest Update 11/12/2026', 'Apex Legends')).toBe(
      'Latest Update 11/12/2026',
    );
    expect(shortUpdateTitle('Apex Legends™: Cipher Patch Notes', 'Apex Legends')).toBe(
      'Cipher Patch Notes',
    );
    expect(shortUpdateTitle('Marvel Rivals Version 20261113 Patch Notes', 'Marvel Rivals')).toBe(
      'Version 20261113 Patch Notes',
    );
    expect(shortUpdateTitle("Cyberpunk 2077's Edgerunners 2 Update", 'Cyberpunk 2077')).toBe(
      "Cyberpunk 2077's Edgerunners 2 Update",
    );
  });

  it('keeps titles that are only, or do not start with, the name', () => {
    expect(shortUpdateTitle('Rust', 'Rust')).toBe('Rust');
    expect(shortUpdateTitle('PRINTED AND POLISHED', 'Rust')).toBe('PRINTED AND POLISHED');
    expect(shortUpdateTitle('Patch Notes - Update 44.1', 'PUBG: Battlegrounds')).toBe(
      'Patch Notes - Update 44.1',
    );
  });
});
