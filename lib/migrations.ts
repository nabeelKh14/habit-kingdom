import * as SQLite from "expo-sqlite";

export const CURRENT_SCHEMA_VERSION = 4;

export interface Migration {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
  down: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: async (db: SQLite.SQLiteDatabase) => {
      // v0 -> v1: Create all initial tables
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('child', 'parent')),
          createdAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS habits (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          coinReward INTEGER NOT NULL,
          color TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          frequency TEXT DEFAULT 'once',
          scheduledTime TEXT,
          daysOfWeek TEXT,
          dayOfMonth INTEGER,
          isPaused INTEGER DEFAULT 0,
          pauseUntil TEXT,
          notificationsEnabled INTEGER DEFAULT 0,
          notificationTime TEXT,
          profileId TEXT NOT NULL,
          deletedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS rewards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          cost INTEGER NOT NULL,
          color TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          profileId TEXT NOT NULL,
          deletedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS completions (
          id TEXT PRIMARY KEY,
          habitId TEXT NOT NULL,
          habitName TEXT NOT NULL,
          coinReward INTEGER NOT NULL,
          completedAt TEXT NOT NULL,
          profileId TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS redemptions (
          id TEXT PRIMARY KEY,
          rewardId TEXT NOT NULL,
          rewardName TEXT NOT NULL,
          cost INTEGER NOT NULL,
          redeemedAt TEXT NOT NULL,
          profileId TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallet (
          profileId TEXT PRIMARY KEY,
          balance INTEGER DEFAULT 0 NOT NULL
        );

        CREATE TABLE IF NOT EXISTS achievements (
          id TEXT PRIMARY KEY,
          trophyId TEXT NOT NULL,
          unlockedAt TEXT NOT NULL,
          profileId TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_stats (
          profileId TEXT PRIMARY KEY,
          totalCompletions INTEGER DEFAULT 0 NOT NULL,
          longestStreak INTEGER DEFAULT 0 NOT NULL,
          longestSingleHabitStreak INTEGER DEFAULT 0 NOT NULL,
          longestSingleHabitId TEXT
        );

        CREATE TABLE IF NOT EXISTS purchased_skills (
          id TEXT PRIMARY KEY,
          skillId TEXT NOT NULL,
          profileId TEXT NOT NULL,
          purchasedAt TEXT NOT NULL
        );
      `);
    },
    down: async (_db: SQLite.SQLiteDatabase) => {
      // v1 -> v0: Drop all tables
      await _db.execAsync(`DROP TABLE IF EXISTS purchased_skills;`);
      await _db.execAsync(`DROP TABLE IF EXISTS user_stats;`);
      await _db.execAsync(`DROP TABLE IF EXISTS achievements;`);
      await _db.execAsync(`DROP TABLE IF EXISTS wallet;`);
      await _db.execAsync(`DROP TABLE IF EXISTS redemptions;`);
      await _db.execAsync(`DROP TABLE IF EXISTS completions;`);
      await _db.execAsync(`DROP TABLE IF EXISTS rewards;`);
      await _db.execAsync(`DROP TABLE IF EXISTS habits;`);
      await _db.execAsync(`DROP TABLE IF EXISTS profiles;`);
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

      // Add deletedAt column for soft delete/archive support (if not exists)
      try {
        await db.execAsync(`ALTER TABLE habits ADD COLUMN deletedAt TEXT;`);
      } catch (e: any) {
        // Column might already exist, ignore duplicate column error
        if (!e.message?.includes('duplicate column')) throw e;
      }
      try {
        await db.execAsync(`ALTER TABLE rewards ADD COLUMN deletedAt TEXT;`);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) throw e;
      }

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
      // First, check if we need to recreate the table
      try {
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
      } catch (e: any) {
        // If table recreation fails, it might already have the constraint
        console.warn('[Migrations v3] purchased_skills recreation note:', e.message);
      }

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
  {
    version: 4,
    up: async (db: SQLite.SQLiteDatabase) => {
      // v3 -> v4: Add updated_at columns for conflict resolution & incremental sync
      const tables = [
        'profiles', 'habits', 'rewards', 'completions', 
        'redemptions', 'wallet', 'achievements', 'user_stats', 'purchased_skills'
      ];
      
      for (const table of tables) {
        try {
          // IMPORTANT: ALTER TABLE ADD COLUMN cannot take a non-constant
          // DEFAULT (e.g. CURRENT_TIMESTAMP) in SQLite/expo-sqlite — it throws
          // "Cannot add a column with non-constant default" and aborts the whole
          // DB init, leaving the app with NO local persistence. Add the column
          // with no default, then backfill existing rows with a constant value.
          await db.execAsync(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT;`);
          await db.execAsync(`UPDATE ${table} SET updated_at = datetime('now') WHERE updated_at IS NULL;`);
        } catch (e: any) {
          if (!e.message?.includes('duplicate column')) throw e;
        }
      }
      
      // Create trigger to auto-update updated_at on changes
      const triggers = [
        { table: 'profiles', cols: 'name, type' },
        { table: 'habits', cols: 'name, icon, coinReward, color, frequency, scheduledTime, daysOfWeek, dayOfMonth, isPaused, pauseUntil, notificationsEnabled, notificationTime, profileId, deletedAt' },
        { table: 'rewards', cols: 'name, icon, cost, color, profileId, deletedAt' },
        { table: 'completions', cols: 'habitId, habitName, coinReward, completedAt, profileId' },
        { table: 'redemptions', cols: 'rewardId, rewardName, cost, redeemedAt, profileId' },
        { table: 'wallet', cols: 'balance' },
        { table: 'achievements', cols: 'trophyId, unlockedAt, profileId' },
        { table: 'user_stats', cols: 'totalCompletions, longestStreak, longestSingleHabitStreak, longestSingleHabitId' },
        { table: 'purchased_skills', cols: 'skillId, profileId, purchasedAt' },
      ];
      
      for (const t of triggers) {
        await db.execAsync(`
          CREATE TRIGGER IF NOT EXISTS update_${t.table}_updated_at
          AFTER UPDATE ON ${t.table}
          BEGIN
            UPDATE ${t.table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
          END;
        `);
      }
      
      // Special trigger for wallet (uses profileId as PK)
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS update_wallet_updated_at
        AFTER UPDATE ON wallet
        BEGIN
          UPDATE wallet SET updated_at = CURRENT_TIMESTAMP WHERE profileId = NEW.profileId;
        END;
      `);
      
      // Special trigger for user_stats (uses profileId as PK)
      await db.execAsync(`
        CREATE TRIGGER IF NOT EXISTS update_user_stats_updated_at
        AFTER UPDATE ON user_stats
        BEGIN
          UPDATE user_stats SET updated_at = CURRENT_TIMESTAMP WHERE profileId = NEW.profileId;
        END;
      `);
      
      console.log('[Migrations v4] Added updated_at columns and triggers');
    },
    down: async (db: SQLite.SQLiteDatabase) => {
      // v4 -> v3: Remove updated_at columns and triggers
      const tables = [
        'profiles', 'habits', 'rewards', 'completions', 
        'redemptions', 'wallet', 'achievements', 'user_stats', 'purchased_skills'
      ];
      
      for (const table of tables) {
        await db.execAsync(`DROP TRIGGER IF EXISTS update_${table}_updated_at;`);
        // Note: SQLite doesn't support DROP COLUMN easily, so we leave the column
        // but it won't be updated anymore
      }
      
      await db.execAsync(`DROP TRIGGER IF EXISTS update_wallet_updated_at;`);
      await db.execAsync(`DROP TRIGGER IF EXISTS update_user_stats_updated_at;`);
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
