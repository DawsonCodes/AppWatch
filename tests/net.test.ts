import { describe, expect, it } from 'vitest';
import { createThrottle } from '../scripts/lib/net.ts';

describe('createThrottle', () => {
  it('lets the first call through immediately and spaces the rest', async () => {
    let now = 1000;
    const waits: number[] = [];
    const throttle = createThrottle(
      500,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
      () => now,
    );
    await throttle();
    expect(waits).toEqual([]);
    now += 200; // 200ms of work
    await throttle();
    expect(waits).toEqual([300]);
    now += 1000; // long gap: no wait needed
    await throttle();
    expect(waits).toEqual([300]);
  });

  it('serializes concurrent callers', async () => {
    let now = 0;
    const waits: number[] = [];
    const throttle = createThrottle(
      100,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
      () => now,
    );
    await Promise.all([throttle(), throttle(), throttle()]);
    expect(waits).toEqual([100, 100]);
  });
});
