import { Pool } from "pg";

/**
 * Direct Postgres connection for the Express server (backend service).
 *
 * The server is the auth authority (bcrypt + its own user ids), so it talks to
 * Postgres DIRECTLY via a connection pool — not through the Supabase REST API
 * (Kong/PostgREST). This avoids schema-cache / exposed-schema friction and is
 * the standard pattern for a backend service owning its tables.
 *
 * Connection string comes from SUPABASE_DB_URL (the postgresql://...:5432 URL).
 * If absent, falls back to building one from EXPO_PUBLIC_SUPABASE_URL host.
 *
 * When no DB is reachable, `pool` is null and callers fall back to in-memory
 * (dev / tests), so the server always boots.
 */

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  (process.env.EXPO_PUBLIC_SUPABASE_URL
    ? process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/^https?:\/\//, "postgresql://postgres:postgres@").replace(/:\d+$/, ":5432") + "/postgres"
    : "");

export const isSupabaseConfigured = Boolean(DB_URL);

export const pool: Pool | null = isSupabaseConfigured
  ? new Pool({
      connectionString: DB_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    "[db] No SUPABASE_DB_URL set — server runs WITHOUT durable storage (in-memory fallback)."
  );
} else {
  // Surface connection errors instead of hanging silently
  pool!.on("error", (err) => {
    console.error("[db] Unexpected Postgres pool error:", err.message);
  });
}
