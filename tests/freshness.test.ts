import { describe, expect, it, vi } from 'vitest';
import { hasNewerRun, pollStatus } from '../src/lib/freshness.ts';

const status = {
  schemaVersion: 1,
  lastRunAt: '2026-07-16T12:00:00.000Z',
  lastSuccessAt: '2026-07-16T12:00:00.000Z',
  totalApps: 8,
  okCount: 8,
  errorCount: 0,
  updatesDetected: 1,
};

describe('hasNewerRun', () => {
  it('detects a strictly newer deployed run', () => {
    expect(hasNewerRun('2026-07-16T00:00:00.000Z', '2026-07-16T12:00:00.000Z')).toBe(true);
    expect(hasNewerRun('2026-07-16T12:00:00.000Z', '2026-07-16T12:00:00.000Z')).toBe(false);
    expect(hasNewerRun('2026-07-16T12:00:00.000Z', '2026-07-16T00:00:00.000Z')).toBe(false);
  });

  it('handles missing and malformed timestamps conservatively', () => {
    expect(hasNewerRun(null, '2026-07-16T12:00:00.000Z')).toBe(true);
    expect(hasNewerRun('2026-07-16T12:00:00.000Z', null)).toBe(false);
    expect(hasNewerRun('2026-07-16T12:00:00.000Z', 'garbage')).toBe(false);
    expect(hasNewerRun('garbage', '2026-07-16T12:00:00.000Z')).toBe(true);
  });
});

describe('pollStatus', () => {
  it('returns a validated status and bypasses HTTP caches', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(status), { status: 200 }));
    const polled = await pollStatus(fetchFn as never);
    expect(polled?.lastRunAt).toBe(status.lastRunAt);
    const init = (fetchFn.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.cache).toBe('no-store');
  });

  it('returns null on HTTP errors, invalid payloads and network failures', async () => {
    expect(
      await pollStatus(vi.fn(async () => new Response('x', { status: 500 })) as never),
    ).toBeNull();
    expect(
      await pollStatus(
        vi.fn(async () => new Response(JSON.stringify({ bogus: true }), { status: 200 })) as never,
      ),
    ).toBeNull();
    expect(
      await pollStatus(
        vi.fn(async () => {
          throw new TypeError('offline');
        }) as never,
      ),
    ).toBeNull();
  });
});
