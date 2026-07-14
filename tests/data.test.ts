import { describe, expect, it, vi } from 'vitest';
import { DataLoadError, isDataStale, loadDashboardData, loadHistory } from '../src/lib/data.ts';
import type { StatusFile } from '../src/shared/types.ts';

const validApps = { schemaVersion: 1, generatedAt: null, apps: [] };
const validStatus: StatusFile = {
  schemaVersion: 1,
  lastRunAt: '2026-07-14T00:00:00.000Z',
  lastSuccessAt: '2026-07-14T00:00:00.000Z',
  totalApps: 0,
  okCount: 0,
  errorCount: 0,
  updatesDetected: 0,
};
const validHistory = { schemaVersion: 1, entries: {} };

function fetchFor(routes: Record<string, { status?: number; body?: unknown; fail?: boolean }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = Object.entries(routes).find(([suffix]) => url.endsWith(suffix))?.[1];
    if (!route || route.fail) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
}

describe('loadDashboardData', () => {
  it('returns apps and status when both load', async () => {
    const data = await loadDashboardData(
      fetchFor({ 'apps.json': { body: validApps }, 'status.json': { body: validStatus } }),
    );
    expect(data.apps.apps).toEqual([]);
    expect(data.status?.totalApps).toBe(0);
  });

  it('degrades gracefully when only status.json fails', async () => {
    const data = await loadDashboardData(
      fetchFor({ 'apps.json': { body: validApps }, 'status.json': { fail: true } }),
    );
    expect(data.apps).toBeTruthy();
    expect(data.status).toBeNull();
  });

  it('throws a friendly error when apps.json cannot be fetched', async () => {
    await expect(
      loadDashboardData(
        fetchFor({ 'apps.json': { fail: true }, 'status.json': { body: validStatus } }),
      ),
    ).rejects.toThrow(DataLoadError);
  });

  it('throws on HTTP errors and invalid payloads', async () => {
    await expect(
      loadDashboardData(
        fetchFor({ 'apps.json': { status: 404 }, 'status.json': { body: validStatus } }),
      ),
    ).rejects.toThrow(/404/);
    await expect(
      loadDashboardData(
        fetchFor({
          'apps.json': { body: { schemaVersion: 999 } },
          'status.json': { body: validStatus },
        }),
      ),
    ).rejects.toThrow(/validation/);
  });

  it('rejects invalid status.json without failing the whole load', async () => {
    const data = await loadDashboardData(
      fetchFor({ 'apps.json': { body: validApps }, 'status.json': { body: { nope: true } } }),
    );
    expect(data.status).toBeNull();
  });
});

describe('loadHistory', () => {
  it('loads and validates history.json', async () => {
    const history = await loadHistory(fetchFor({ 'history.json': { body: validHistory } }));
    expect(history.entries).toEqual({});
  });

  it('throws on invalid history payloads', async () => {
    await expect(
      loadHistory(fetchFor({ 'history.json': { body: { entries: 'bad' } } })),
    ).rejects.toThrow(DataLoadError);
  });
});

describe('isDataStale', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');

  it('flags data older than the staleness window', () => {
    expect(isDataStale({ ...validStatus, lastRunAt: '2026-07-10T00:00:00.000Z' }, now)).toBe(true);
    expect(isDataStale({ ...validStatus, lastRunAt: '2026-07-14T06:00:00.000Z' }, now)).toBe(false);
  });

  it('never flags missing status', () => {
    expect(isDataStale(null, now)).toBe(false);
    expect(isDataStale({ ...validStatus, lastRunAt: null }, now)).toBe(false);
  });
});
