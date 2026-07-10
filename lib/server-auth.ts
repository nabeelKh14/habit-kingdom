import AsyncStorage from '@react-native-async-storage/async-storage';

// =========================================================================
// SERVER AUTH BRIDGE
// -------------------------------------------------------------------------
// The Habit Kingdom server (Express) owns authentication and is the
// authoritative store for all domain data. The RN app keeps a local SQLite
// cache for offline-first use, but every profile is mirrored to the server
// as a `server_users` row keyed by the app's local profile id.
//
// Server session tokens are stored per-profile in AsyncStorage so that the
// app can keep multiple profiles (1 parent + 1 child) each with their own
// server session, mirroring the local-first model.
// =========================================================================

const TOKEN_KEY_PREFIX = 'hk_server_token_';
const PASSWORD_KEY_PREFIX = 'hk_server_pw_';

function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) return 'https://api.habitkingdom.app';
  return raw.replace(/\/$/, '');
}

async function getToken(profileId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY_PREFIX + profileId);
  } catch {
    return null;
  }
}

async function setToken(profileId: string, token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY_PREFIX + profileId, token);
  } catch { /* best-effort */ }
}

async function getStoredPassword(profileId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PASSWORD_KEY_PREFIX + profileId);
  } catch {
    return null;
  }
}

async function setStoredPassword(profileId: string, password: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PASSWORD_KEY_PREFIX + profileId, password);
  } catch { /* best-effort */ }
}

/**
 * Ensure the given local profile has a server session. Registers the profile
 * on first use, then logs in to obtain a fresh token on subsequent syncs.
 *
 * The app profile id IS the server user id (server_users.id is text/uuid).
 * A deterministic per-profile password is derived from the profile id so the
 * app can silently re-authenticate without a separate login screen (the app
 * already gates access locally via its own onboarding/parent locks).
 *
 * Returns the bearer token, or null if the server is unreachable.
 */
export async function ensureServerSession(profileId: string): Promise<string | null> {
  if (!profileId) return null;
  const existing = await getToken(profileId);
  if (existing) return existing;

  // Derive a stable password from the profile id (server requires >=8 chars).
  const password = `hk_${profileId.replace(/-/g, '').slice(0, 22).padEnd(8, '0')}`;
  const username = `hk_${profileId.replace(/-/g, '')}`;

  try {
    const registerRes = await fetch(`${apiBaseUrl()}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (registerRes.ok) {
      const data = await registerRes.json();
      if (data?.token) {
        await setToken(profileId, data.token);
        await setStoredPassword(profileId, password);
        return data.token;
      }
    }
    // 409 = already registered (from a prior device/run) — fall through to login.
    if (registerRes.status !== 409 && registerRes.status !== 400) {
      return null;
    }
  } catch {
    return null; // network down — stay local-first
  }

  // Login to get a token.
  try {
    const loginRes = await fetch(`${apiBaseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      if (data?.token) {
        await setToken(profileId, data.token);
        await setStoredPassword(profileId, password);
        return data.token;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Return a valid bearer token for the profile, refreshing via login if needed.
 */
export async function getServerToken(profileId: string): Promise<string | null> {
  const existing = await getToken(profileId);
  if (existing) return existing;
  return ensureServerSession(profileId);
}

/** Remove the stored server session for a profile (e.g. on local logout). */
export async function clearServerSession(profileId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY_PREFIX + profileId);
    await AsyncStorage.removeItem(PASSWORD_KEY_PREFIX + profileId);
  } catch { /* best-effort */ }
}
