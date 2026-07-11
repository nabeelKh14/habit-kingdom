import { Pool } from "pg";
import dotenv from "dotenv";

// CRITICAL: load .env BEFORE reading process.env below. db.ts is imported
// (and its module-level consts evaluated) before middleware.ts's dotenv.config()
// would otherwise run, so without this the server silently fell back to the
// in-memory store even when SUPABASE_DB_URL was present. (Fixed during final
// delivery QA — the DB was never actually exercised at runtime before this.)
dotenv.config();

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
    ? process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/^https?:\/\//, "postgresql://postgres:***@").replace(/:\d+$/, ":5432") + "/postgres"
    : "");

// Explicit opt-out: run with the in-memory store only (offline / CI / local dev
// with no Postgres reachable). Mirrors the DISABLE_RATE_LIMIT convention.
const FORCE_IN_MEMORY = process.env.DISABLE_DB === "true";

export const isSupabaseConfigured = Boolean(DB_URL) && !FORCE_IN_MEMORY;

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
    "[db] No durable DB configured — server runs WITHOUT durable storage (in-memory fallback)."
  );
} else {
  // Surface connection errors instead of hanging silently
  pool!.on("error", (err) => {
    console.error("[db] Unexpected Postgres pool error:", err.message);
  });
}
