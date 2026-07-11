/**
 * Feature Flags — remote-configurable toggle system.
 * 
 * Usage:
 *   import { isFeatureEnabled, FeatureFlag, setFeatureFlag } from '../lib/feature-flags';
 *   if (isFeatureEnabled(FeatureFlag.SOCIAL_FEATURES)) { ... }
 * 
 * Backward-compatible with old API:
 *   import { FEATURE_FLAGS, isEnabled } from './feature-flags';
 *   if (isEnabled('PARENT_ACCESS_CONTROL')) { ... }
 */

export enum FeatureFlag {
  // Core features
  SOCIAL_FEATURES = "social_features",
  CLOUD_SYNC = "cloud_sync",
  PARENT_CONTROLS = "parent_controls",
  DARK_MODE = "dark_mode",

  // Kids safety
  STRICT_MODERATION = "strict_moderation",
  CHILD_DATA_DELETION = "child_data_deletion",
  PARENT_ACCESS_CONTROL = "parent_access_control",

  // Performance
  LAZY_LOADING = "lazy_loading",
  IMAGE_OPTIMIZATION = "image_optimization",
  PAGINATION = "pagination",

  // Notifications
  PUSH_NOTIFICATIONS = "push_notifications",
  HABIT_REMINDERS = "habit_reminders",
  STREAK_ALERTS = "streak_alerts",

  // Analytics
  ANONYMOUS_ANALYTICS = "anonymous_analytics",
  CRASH_REPORTING = "crash_reporting",
}

/**
 * Default flag values — always safe defaults for children.
 * Override via remote config in production.
 */
const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  [FeatureFlag.SOCIAL_FEATURES]: false, // Children: no social by default
  [FeatureFlag.CLOUD_SYNC]: true,
  [FeatureFlag.PARENT_CONTROLS]: true,
  [FeatureFlag.DARK_MODE]: true,

  [FeatureFlag.STRICT_MODERATION]: true, // Always on for children
  [FeatureFlag.CHILD_DATA_DELETION]: true,
  [FeatureFlag.PARENT_ACCESS_CONTROL]: true,

  [FeatureFlag.LAZY_LOADING]: true,
  [FeatureFlag.IMAGE_OPTIMIZATION]: true,
  [FeatureFlag.PAGINATION]: true,

  [FeatureFlag.PUSH_NOTIFICATIONS]: true,
  [FeatureFlag.HABIT_REMINDERS]: true,
  [FeatureFlag.STREAK_ALERTS]: true,

  [FeatureFlag.ANONYMOUS_ANALYTICS]: false, // Off by default for children
  [FeatureFlag.CRASH_REPORTING]: true,
};

// In-memory override store
const overrides = new Map<FeatureFlag, boolean>();

/**
 * Check if a feature is enabled.
 * Falls back: override → default → false.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (overrides.has(flag)) {
    return overrides.get(flag)!;
  }
  return DEFAULT_FLAGS[flag] ?? false;
}

/**
 * Override a feature flag for the current session.
 * Pass `null` to clear the override (revert to default).
 */
export function setFeatureFlag(flag: FeatureFlag, value: boolean | null): void {
  if (value === null) {
    overrides.delete(flag);
  } else {
    overrides.set(flag, value);
  }
}

/**
 * Override multiple flags at once (e.g., from remote config).
 */
export function setFeatureFlags(flags: Partial<Record<FeatureFlag, boolean | null>>): void {
  for (const [key, value] of Object.entries(flags)) {
    const flag = key as FeatureFlag;
    if (value === null || value === undefined) {
      overrides.delete(flag);
    } else {
      overrides.set(flag, value);
    }
  }
}

/**
 * Reset all overrides (revert to defaults).
 */
export function resetFeatureFlags(): void {
  overrides.clear();
}

/**
 * Get all current flag states.
 */
export function getAllFeatureFlags(): Record<FeatureFlag, boolean> {
  const result = {} as Record<FeatureFlag, boolean>;
  for (const flag of Object.values(FeatureFlag)) {
    result[flag] = isFeatureEnabled(flag);
  }
  return result;
}

/**
 * Resolve the base URL of the Habit Kingdom Express server.
 * Mirrors the convention used by lib/server-sync.ts and lib/server-auth.ts.
 */
function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) return "https://api.habitkingdom.app";
  return raw.replace(/\/$/, "");
}

/**
 * Load flags from the real remote config source — the Habit Kingdom Express
 * server's `GET /api/v1/feature-flags` endpoint (server/remote-config.ts).
 *
 * This is the ONLY flag source that actually exists in production (there is no
 * Supabase edge function). The endpoint is authenticated, so the caller must
 * pass a valid server JWT (obtained via lib/server-auth#getServerToken).
 *
 * @param token    A server bearer token (from getServerToken(profileId)).
 * @param profileId The local profile id, used to derive the token when omitted.
 * @returns The number of flags that were updated from the server response.
 */
export async function loadRemoteFeatureFlags(
  token?: string | null,
  profileId?: string | null,
): Promise<number> {
  try {
    // Resolve the token: prefer the explicit one, else derive from the profile.
    let authToken = token ?? null;
    if (!authToken && profileId) {
      try {
        const { getServerToken } = await import("./server-auth");
        authToken = await getServerToken(profileId);
      } catch {
        authToken = null;
      }
    }

    if (!authToken) {
      // No server session (offline or server not configured) — keep defaults.
      console.warn("[FeatureFlags] No server token — using default flags");
      return 0;
    }

    const url = `${getApiBaseUrl()}/api/v1/feature-flags`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      console.warn("[FeatureFlags] Remote config fetch failed:", response.status);
      return 0;
    }

    const body = (await response.json()) as {
      effectiveFlags?: Partial<Record<FeatureFlag, boolean>>;
    };
    const data = body.effectiveFlags ?? {};
    setFeatureFlags(data);
    return Object.keys(data).length;
  } catch (err) {
    console.warn("[FeatureFlags] Remote config error (using defaults):", err);
    return 0;
  }
}

/**
 * Explicit entrypoint for app boot: fetch remote flags for the active profile.
 * Safe to call with no active profile — it degrades to defaults and never throws.
 */
export async function fetchFeatureFlags(profileId?: string | null): Promise<number> {
  return loadRemoteFeatureFlags(null, profileId ?? null);
}

/**
 * For testing: clear everything and set to defaults.
 */
export function resetToDefaults(): void {
  overrides.clear();
}

// ── Backward-compatible exports (old API) ──

/**
 * @deprecated Use `FeatureFlag` enum + `isFeatureEnabled()` instead.
 */
export const FEATURE_FLAGS: Record<string, boolean> = {
  PARENT_ACCESS_CONTROL: true,
  PROFILE_ISOLATION_CHECKS: true,
  SOFT_DELETE_ARCHIVE: true,
  PAGINATED_ACTIVITY: false,
  TROPHY_NOTIFICATIONS: true,
  SKILL_TREE_V2: false,
};

/**
 * @deprecated Use `isFeatureEnabled(FeatureFlag.XXX)` instead.
 */
export function isEnabled(flag: string): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}

/**
 * @deprecated Use direct FeatureFlag enum comparison instead.
 */
export function getFlagValue(flag: string): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}

/**
 * @deprecated Use ternary with isFeatureEnabled() instead.
 */
export function withFeatureFlag<T>(flag: string, whenEnabled: T, whenDisabled: T): T {
  return isEnabled(flag) ? whenEnabled : whenDisabled;
}
