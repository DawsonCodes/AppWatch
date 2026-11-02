import { describe, expect, it } from 'vitest';
import { displayPair, shortVersion } from '../src/lib/versionDisplay.ts';

describe('shortVersion', () => {
  it('trims tags, build numbers and trailing zeros', () => {
    const cases: [string, string][] = [
      ['26.19.0+rc3-2026.10.28', '26.19'],
      ['1.2.53-release.00', '1.2.53'],
      ['12.39.0-prod.01', '12.39'],
      ['156.0.8078.74', '156'],
      ['159.0', '159'],
      ['159.1', '159.1'],
      ['452.0.0.50.64', '452'],
      ['0.745.0.7451137', '0.745'],
      ['1.3.6.1921.g70867c071a617', '1.3.6'],
      ['26.1027.51404', '26.1027'],
      ['3.745.10001', '3.745'],
      ['14.30.0.59', '14.30'],
      ['6000.6.7f1', '6000.6.7'],
      ['2.1.6.02', '2.1.6'],
      ['v2.4', '2.4'],
    ];
    for (const [raw, short] of cases) expect(shortVersion(raw)).toBe(short);
  });

  it('leaves versions with nothing to trim, and non-numeric ones, alone', () => {
    for (const raw of ['1.2026.293', '1.261030.19', '5.20.5', '14.2', 'Varies', '2026.41.3']) {
      expect(shortVersion(raw)).toBe(raw);
    }
  });
});

describe('displayPair', () => {
  it('shortens an update only when the short forms still differ', () => {
    expect(displayPair('26.18.0', '26.19.0', true)).toEqual({ from: '26.18', to: '26.19' });
    expect(displayPair('156.0.8078.70', '156.0.8078.74', true)).toEqual({
      from: '156.0.8078.70',
      to: '156.0.8078.74',
    });
    expect(displayPair('1.0.0', '1.1.0', false)).toEqual({ from: '1.0.0', to: '1.1.0' });
  });
});
