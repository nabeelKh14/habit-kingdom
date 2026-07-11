import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the server-auth module so we control token resolution without touching
// real network/auth.
vi.mock('../../lib/server-auth', () => ({
  getServerToken: vi.fn(),
}));

import { getServerToken } from '../../lib/server-auth';
import {
  FeatureFlag,
  isFeatureEnabled,
  resetFeatureFlags,
  loadRemoteFeatureFlags,
  fetchFeatureFlags,
  getAllFeatureFlags,
} from '../../lib/feature-flags';

// Capture the fetch calls.
let fetchCalls: any[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetFeatureFlags();
  fetchCalls = [];
  (getServerToken as any).mockReset();
  globalThis.fetch = vi.fn(async (url: string, opts: any) => {
    fetchCalls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        effectiveFlags: {
          [FeatureFlag.SOCIAL_FEATURES]: true,
          [FeatureFlag.DARK_MODE]: false,
        } as Record<FeatureFlag, boolean>,
      }),
    } as any;
  }) as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('client remote feature flags', () => {
  it('points loadRemoteFeatureFlags at the real Express /api/v1/feature-flags endpoint', async () => {
    const updated = await loadRemoteFeatureFlags('test-jwt', 'profile-1');

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain('/api/v1/feature-flags');
    expect(fetchCalls[0].opts.headers.Authorization).toBe('Bearer test-jwt');
    expect(updated).toBe(2);
  });

  it('derives the token from the profile when none is passed', async () => {
    (getServerToken as any).mockResolvedValue('derived-token');

    const updated = await loadRemoteFeatureFlags(null, 'profile-9');

    expect(getServerToken).toHaveBeenCalledWith('profile-9');
    expect(fetchCalls[0].opts.headers.Authorization).toBe('Bearer derived-token');
    expect(updated).toBe(2);
  });

  it('applies effectiveFlags from the server response and overrides defaults', async () => {
    await loadRemoteFeatureFlags('jwt');

    // Server flipped these two away from their defaults.
    expect(isFeatureEnabled(FeatureFlag.SOCIAL_FEATURES)).toBe(true); // default false
    expect(isFeatureEnabled(FeatureFlag.DARK_MODE)).toBe(false); // default true
    // Untouched flags keep their safe defaults.
    expect(isFeatureEnabled(FeatureFlag.CLOUD_SYNC)).toBe(true);
  });

  it('returns 0 and keeps defaults when no token is available (offline)', async () => {
    (getServerToken as any).mockResolvedValue(null);

    const updated = await loadRemoteFeatureFlags(null, 'no-session');

    expect(updated).toBe(0);
    expect(fetchCalls.length).toBe(0);
    expect(isFeatureEnabled(FeatureFlag.DARK_MODE)).toBe(true); // default untouched
  });

  it('degrades to defaults on a non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as any;

    const updated = await loadRemoteFeatureFlags('jwt');

    expect(updated).toBe(0);
    expect(isFeatureEnabled(FeatureFlag.DARK_MODE)).toBe(true); // default kept
  });

  it('fetchFeatureFlags boot entrypoint resolves flags for the active profile', async () => {
    (getServerToken as any).mockResolvedValue('boot-token');

    const updated = await fetchFeatureFlags('active-profile');

    expect(getServerToken).toHaveBeenCalledWith('active-profile');
    expect(fetchCalls[0].opts.headers.Authorization).toBe('Bearer boot-token');
    expect(updated).toBe(2);
  });

  it('getAllFeatureFlags reflects the applied overrides', async () => {
    await loadRemoteFeatureFlags('jwt');

    const all = getAllFeatureFlags();
    expect(all[FeatureFlag.SOCIAL_FEATURES]).toBe(true);
    expect(all[FeatureFlag.DARK_MODE]).toBe(false);
  });
});
