import * as SQLite from "expo-sqlite";

export const CURRENT_SCHEMA_VERSION = 3;

export interface Migration {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
  down: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: async (_db: SQLite.SQLiteDatabase) => {
      // v0 -> v1: Initial schema (handled by existing initializeTables)
    },
    down: async (_db: SQLite.SQLiteDatabase) => {
      // v1 -> v0: No rollback needed for initial schema
    },
  },
  {
    version: 2,
    up: async (db: SQLite.SQLiteDatabase) => {
      // v1 -> v2: Add indexes for better query performance
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_completions_profile_completed 
        ON completions(profileId, completedAt DESC);
      `);
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_habits_frequency ON habits(frequency);
      `);
    },
    down: async (_db: SQLite.SQLiteDatabase) => {
      // v2 -> v1: Indexes are optional, no rollback needed
    },
  },
  {
    version: 3,
    up: async (db: SQLite.SQLiteDatabase) => {
      // v2 -> v3: Add UNIQUE constraints and archive support

      // Add deletedAt column for soft delete/archive support
      await db.execAsync(`
        ALTER TABLE habits ADD COLUMN deletedAt TEXT;
      `);
      await db.execAsync(`
        ALTER TABLE rewards ADD COLUMN deletedAt TEXT;
      `);

      // Add parent count limit check table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS profile_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          maxParents INTEGER DEFAULT 2,
          maxChildren INTEGER DEFAULT 1
        );
      `);
      await db.execAsync(`
        INSERT OR IGNORE INTO profile_settings (id, maxParents, maxChildren) VALUES (1, 2, 1);
      `);

      // Add purchased skills unique constraint (profileId, skillId)
      // First, drop the table and recreate with proper constraints
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS purchased_skills_new (
          id TEXT PRIMARY KEY NOT NULL,
          skillId TEXT NOT NULL,
          profileId TEXT NOT NULL,
          purchasedAt TEXT NOT NULL,
          UNIQUE(profileId, skillId)
        );
      `);
      await db.execAsync(`
        INSERT OR IGNORE INTO purchased_skills_new (id, skillId, profileId, purchasedAt)
        SELECT id, skillId, profileId, purchasedAt FROM purchased_skills;
      `);
      await db.execAsync(`DROP TABLE purchased_skills;`);
      await db.execAsync(`ALTER TABLE purchased_skills_new RENAME TO purchased_skills;`);

      // Add profile type CHECK constraint via trigger
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS validate_profile_type_insert
        BEFORE INSERT ON profiles
        BEGIN
          SELECT CASE
            WHEN NEW.type NOT IN ('child', 'parent') THEN
              RAISE(ABORT, 'Invalid profile type')
          END;
        END;
      `);
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS validate_profile_type_update
        BEFORE UPDATE ON profiles
        BEGIN
          SELECT CASE
            WHEN NEW.type NOT IN ('child', 'parent') THEN
              RAISE(ABORT, 'Invalid profile type')
          END;
        END;
      `);

      // Ensure 'default' profile exists
      await db.execAsync(`
        INSERT OR IGNORE INTO profiles (id, name, type, createdAt) 
        VALUES ('default', 'Default', 'child', datetime('now'));
      `);
      await db.execAsync(`
        INSERT OR IGNORE INTO wallet (profileId, balance) VALUES ('default', 0);
      `);
      await db.execAsync(`
        INSERT OR IGNORE INTO user_stats (profileId, totalCompletions, longestStreak, longestSingleHabitStreak) 
        VALUES ('default', 0, 0, 0);
      `);
    },
    down: async (db: SQLite.SQLiteDatabase) => {
      // v3 -> v2: Remove new columns and tables
      // Note: SQLite doesn't support DROP COLUMN easily, so we recreate the table
      // This is a simplified rollback

      await db.execAsync(`DROP TRIGGER IF EXISTS validate_profile_type_insert;`);
      await db.execAsync(`DROP TRIGGER IF EXISTS validate_profile_type_update;`);

      await db.execAsync(`DROP TABLE IF EXISTS profile_settings;`);

      // Restore purchased_skills without UNIQUE constraint
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS purchased_skills_old (
          id TEXT PRIMARY KEY NOT NULL,
          skillId TEXT NOT NULL,
          profileId TEXT,
          purchasedAt TEXT NOT NULL
        );
      `);
      await db.execAsync(`
        INSERT OR IGNORE INTO purchased_skills_old (id, skillId, profileId, purchasedAt)
        SELECT id, skillId, profileId, purchasedAt FROM purchased_skills;
      `);
      await db.execAsync(`DROP TABLE purchased_skills;`);
      await db.execAsync(`ALTER TABLE purchased_skills_old RENAME TO purchased_skills;`);
    },
  },
];

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Get current schema version from SQLite PRAGMA
  const versionResult = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  const currentVersion = versionResult?.user_version ?? 0;

  console.log(`[Migrations] Current schema version: ${currentVersion}, Target: ${CURRENT_SCHEMA_VERSION}`);

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    console.log("[Migrations] Database is up to date");
    return;
  }

  // Enable foreign keys for this session
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // Run pending migrations
  for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const migration = MIGRATIONS.find((m) => m.version === v);
    if (!migration) {
      console.warn(`[Migrations] No migration found for version ${v}, skipping`);
      continue;
    }

    console.log(`[Migrations] Running migration v${v}...`);
    try {
      await migration.up(db);

      // Update SQLite's user_version
      await db.execAsync(`PRAGMA user_version = ${v}`);

      console.log(`[Migrations] Migration v${v} completed successfully`);
    } catch (error) {
      console.error(`[Migrations] Migration v${v} failed:`, error);
      throw error;
    }
  }
}

export async function rollbackMigration(
  db: SQLite.SQLiteDatabase,
  targetVersion: number
): Promise<void> {
  const versionResult = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  const currentVersion = versionResult?.user_version ?? 0;

  if (targetVersion >= currentVersion) {
    throw new Error("Cannot rollback to same or higher version");
  }

  console.log(`[Migrations] Rolling back from v${currentVersion} to v${targetVersion}`);

  for (let v = currentVersion; v > targetVersion; v--) {
    const migration = MIGRATIONS.find((m) => m.version === v);
    if (!migration) {
      console.warn(`[Migrations] No rollback found for version ${v}, skipping`);
      continue;
    }

    console.log(`[Migrations] Rolling back migration v${v}...`);
    try {
      await migration.down(db);
      await db.execAsync(`PRAGMA user_version = ${v - 1}`);
      console.log(`[Migrations] Rollback v${v} completed successfully`);
    } catch (error) {
      console.error(`[Migrations] Rollback v${v} failed:`, error);
      throw error;
    }
  }
}
