import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  try {
    // Try to open database
    db = await SQLite.openDatabaseAsync("kidhabit.db");
    await db.execAsync("PRAGMA foreign_keys = ON;");
    
    // Run migrations
    await runMigrations(db);
    
    // Initialize tables if needed (for fresh installs)
    await initializeTables(db);
    
    console.log('[DB] Database initialized successfully');
    return db;
  } catch (error) {
    console.error('[DB] Database initialization failed:', error);
    // Return null if initialization fails - storage functions will handle this
    throw error;
  }
}

// Check if database is available
export function isDatabaseAvailable(): boolean {
  return db !== null;
}

// Transaction wrapper for atomic operations
export async function withTransaction<T>(
  operations: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  const database = await getDatabase();
  try {
    await database.execAsync("BEGIN TRANSACTION");
    const result = await operations(database);
    await database.execAsync("COMMIT");
    return result;
  } catch (error) {
    await database.execAsync("ROLLBACK");
    throw error;
  }
}

// ==================== INITIALIZATION ====================

async function initializeTables(database: SQLite.SQLiteDatabase): Promise<void> {
  // Create profiles table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('child', 'parent')),
      createdAt TEXT NOT NULL
    );
  `);

  // Create indexes for profiles
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
  `);

  // Create habits table with soft delete support
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY NOT NULL,
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
  `);

  // Create indexes for habits
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_habits_profileId ON habits(profileId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_habits_createdAt ON habits(createdAt);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_habits_frequency ON habits(frequency);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_habits_deletedAt ON habits(deletedAt);
  `);

  // Create rewards table with soft delete support
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      cost INTEGER NOT NULL,
      color TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      profileId TEXT NOT NULL,
      deletedAt TEXT
    );
  `);

  // Create indexes for rewards
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_rewards_profileId ON rewards(profileId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_rewards_createdAt ON rewards(createdAt);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_rewards_deletedAt ON rewards(deletedAt);
  `);

  // Create completions table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS completions (
      id TEXT PRIMARY KEY NOT NULL,
      habitId TEXT NOT NULL,
      habitName TEXT NOT NULL,
      coinReward INTEGER NOT NULL,
      completedAt TEXT NOT NULL,
      profileId TEXT NOT NULL
    );
  `);

  // Create indexes for completions
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_completions_profileId ON completions(profileId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_completions_habitId ON completions(habitId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_completions_completedAt ON completions(completedAt);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_completions_profile_completed 
    ON completions(profileId, completedAt DESC);
  `);

  // Create redemptions table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS redemptions (
      id TEXT PRIMARY KEY NOT NULL,
      rewardId TEXT NOT NULL,
      rewardName TEXT NOT NULL,
      cost INTEGER NOT NULL,
      redeemedAt TEXT NOT NULL,
      profileId TEXT NOT NULL
    );
  `);

  // Create indexes for redemptions
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_redemptions_profileId ON redemptions(profileId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_redemptions_rewardId ON redemptions(rewardId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_redemptions_redeemedAt ON redemptions(redeemedAt);
  `);

  // Create wallet table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS wallet (
      profileId TEXT PRIMARY KEY NOT NULL,
      balance INTEGER DEFAULT 0
    );
  `);

  // Create achievements table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY NOT NULL,
      trophyId TEXT NOT NULL,
      unlockedAt TEXT NOT NULL,
      profileId TEXT NOT NULL
    );
  `);

  // Create indexes for achievements
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_achievements_profileId ON achievements(profileId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_achievements_trophyId ON achievements(trophyId);
  `);

  // Create user stats table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS user_stats (
      profileId TEXT PRIMARY KEY NOT NULL,
      totalCompletions INTEGER DEFAULT 0,
      longestStreak INTEGER DEFAULT 0,
      longestSingleHabitStreak INTEGER DEFAULT 0,
      longestSingleHabitId TEXT
    );
  `);

  // Create purchased skills table with UNIQUE constraint
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS purchased_skills (
      id TEXT PRIMARY KEY NOT NULL,
      skillId TEXT NOT NULL,
      profileId TEXT NOT NULL,
      purchasedAt TEXT NOT NULL,
      UNIQUE(profileId, skillId)
    );
  `);

  // Create indexes for purchased_skills
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_purchased_skills_skillId ON purchased_skills(skillId);
  `);
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_purchased_skills_profileId ON purchased_skills(profileId);
  `);

  // Create profile_settings table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS profile_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      maxParents INTEGER DEFAULT 2,
      maxChildren INTEGER DEFAULT 1
    );
  `);
  await database.execAsync(`
    INSERT OR IGNORE INTO profile_settings (id, maxParents, maxChildren) VALUES (1, 2, 1);
  `);

  // Initialize default profile if none exist
  await database.execAsync(`
    INSERT OR IGNORE INTO profiles (id, name, type, createdAt) 
    VALUES ('default', 'Default', 'child', datetime('now'));
  `);
  await database.execAsync(`
    INSERT OR IGNORE INTO wallet (profileId, balance) VALUES ('default', 0);
  `);
  await database.execAsync(`
    INSERT OR IGNORE INTO user_stats (profileId, totalCompletions, longestStreak, longestSingleHabitStreak) 
    VALUES ('default', 0, 0, 0);
  `);

  // Run migrations for any pending schema updates
  await runMigrations(database);
}

// ==================== PROFILE OPERATIONS ====================

export interface ProfileRow {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

export async function getAllProfiles(): Promise<ProfileRow[]> {
  const database = await getDatabase();
  return await database.getAllAsync<ProfileRow>("SELECT * FROM profiles ORDER BY createdAt ASC");
}

export async function insertProfile(profile: {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO profiles (id, name, type, createdAt) VALUES (?, ?, ?, ?)`,
    [profile.id, profile.name, profile.type, profile.createdAt]
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO wallet (profileId, balance) VALUES (?, 0)`,
    [profile.id]
  );
  await database.runAsync(
    `INSERT OR IGNORE INTO user_stats (profileId, totalCompletions, longestStreak, longestSingleHabitStreak) VALUES (?, 0, 0, 0)`,
    [profile.id]
  );
}

export async function updateProfile(id: string, name: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE profiles SET name = ? WHERE id = ?", [name, id]);
}

export async function removeProfile(id: string): Promise<void> {
  if (id === 'default') {
    throw new Error('Cannot delete the default profile');
  }
  
  const database = await getDatabase();
  
  const profile = await database.getFirstAsync<{ id: string; type: string }>(
    "SELECT id, type FROM profiles WHERE id = ?", 
    [id]
  );
  
  if (!profile) {
    return;
  }
  
  if (profile.type === 'child') {
    // Child profile: cascade delete
    await database.runAsync("DELETE FROM habits WHERE profileId = ?", [id]);
    await database.runAsync("DELETE FROM rewards WHERE profileId = ?", [id]);
    await database.runAsync("DELETE FROM completions WHERE profileId = ?", [id]);
    await database.runAsync("DELETE FROM redemptions WHERE profileId = ?", [id]);
    await database.runAsync("DELETE FROM achievements WHERE profileId = ?", [id]);
    await database.runAsync("DELETE FROM user_stats WHERE profileId = ?", [id]);
    await database.runAsync("DELETE FROM wallet WHERE profileId = ?", [id]);
    await database.runAsync("DELETE FROM purchased_skills WHERE profileId = ?", [id]);
  } else {
    // Parent profile: reassign to default
    const reassignTo = 'default';
    await database.runAsync("UPDATE habits SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
    await database.runAsync("UPDATE rewards SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
    await database.runAsync("UPDATE completions SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
    await database.runAsync("UPDATE redemptions SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
    await database.runAsync("UPDATE achievements SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
    await database.runAsync("UPDATE user_stats SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
    await database.runAsync("UPDATE wallet SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
    await database.runAsync("UPDATE purchased_skills SET profileId = ? WHERE profileId = ?", [reassignTo, id]);
  }
  
  await database.runAsync("DELETE FROM profiles WHERE id = ?", [id]);
}

export async function getProfileSettings(): Promise<{ maxParents: number; maxChildren: number }> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ maxParents: number; maxChildren: number }>(
    "SELECT maxParents, maxChildren FROM profile_settings WHERE id = 1"
  );
  return result || { maxParents: 2, maxChildren: 1 };
}

// ==================== HABIT OPERATIONS ====================

export interface HabitRow {
  id: string;
  name: string;
  icon: string;
  coinReward: number;
  color: string;
  createdAt: string;
  frequency: string;
  scheduledTime: string | null;
  daysOfWeek: string | null;
  dayOfMonth: number | null;
  isPaused: number;
  pauseUntil: string | null;
  notificationsEnabled: number;
  notificationTime: string | null;
  profileId: string | null;
  deletedAt: string | null;
}

export async function getAllHabits(profileId?: string, includeArchived = false): Promise<HabitRow[]> {
  const database = await getDatabase();
  if (profileId) {
    const query = includeArchived
      ? "SELECT * FROM habits WHERE profileId = ? ORDER BY createdAt DESC"
      : "SELECT * FROM habits WHERE profileId = ? AND deletedAt IS NULL ORDER BY createdAt DESC";
    return await database.getAllAsync<HabitRow>(query, [profileId]);
  }
  const query = includeArchived
    ? "SELECT * FROM habits ORDER BY createdAt DESC"
    : "SELECT * FROM habits WHERE deletedAt IS NULL ORDER BY createdAt DESC";
  return await database.getAllAsync<HabitRow>(query);
}

export async function insertHabit(habit: {
  id: string;
  name: string;
  icon: string;
  coinReward: number;
  color: string;
  createdAt: string;
  frequency: string;
  scheduledTime?: string;
  daysOfWeek?: string;
  dayOfMonth?: number;
  notificationsEnabled?: number;
  notificationTime?: string;
  profileId: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO habits (id, name, icon, coinReward, color, createdAt, frequency, scheduledTime, daysOfWeek, dayOfMonth, notificationsEnabled, notificationTime, profileId) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      habit.id,
      habit.name,
      habit.icon,
      habit.coinReward,
      habit.color,
      habit.createdAt,
      habit.frequency,
      habit.scheduledTime || null,
      habit.daysOfWeek || null,
      habit.dayOfMonth || null,
      habit.notificationsEnabled ?? 0,
      habit.notificationTime || null,
      habit.profileId,
    ]
  );
}

export async function archiveHabit(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE habits SET deletedAt = datetime('now') WHERE id = ?",
    [id]
  );
}

export async function restoreHabit(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE habits SET deletedAt = NULL WHERE id = ?",
    [id]
  );
}

export async function removeHabit(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM completions WHERE habitId = ?", [id]);
  await database.runAsync("DELETE FROM habits WHERE id = ?", [id]);
}

export async function getHabitById(id: string): Promise<HabitRow | null> {
  const database = await getDatabase();
  return await database.getFirstAsync<HabitRow>("SELECT * FROM habits WHERE id = ?", [id]);
}

export async function updateHabit(habit: {
  id: string;
  name?: string;
  icon?: string;
  coinReward?: number;
  color?: string;
  frequency?: string;
  scheduledTime?: string;
  daysOfWeek?: string;
  dayOfMonth?: number;
  isPaused?: number;
  pauseUntil?: string;
  notificationsEnabled?: number;
  notificationTime?: string;
  profileId?: string;
}): Promise<void> {
  const database = await getDatabase();
  
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (habit.name !== undefined) { fields.push('name = ?'); values.push(habit.name); }
  if (habit.icon !== undefined) { fields.push('icon = ?'); values.push(habit.icon); }
  if (habit.coinReward !== undefined) { fields.push('coinReward = ?'); values.push(habit.coinReward); }
  if (habit.color !== undefined) { fields.push('color = ?'); values.push(habit.color); }
  if (habit.frequency !== undefined) { fields.push('frequency = ?'); values.push(habit.frequency); }
  if (habit.scheduledTime !== undefined) { fields.push('scheduledTime = ?'); values.push(habit.scheduledTime || null); }
  if (habit.daysOfWeek !== undefined) { fields.push('daysOfWeek = ?'); values.push(habit.daysOfWeek || null); }
  if (habit.dayOfMonth !== undefined) { fields.push('dayOfMonth = ?'); values.push(habit.dayOfMonth || null); }
  if (habit.isPaused !== undefined) { fields.push('isPaused = ?'); values.push(habit.isPaused); }
  if (habit.pauseUntil !== undefined) { fields.push('pauseUntil = ?'); values.push(habit.pauseUntil || null); }
  if (habit.notificationsEnabled !== undefined) { fields.push('notificationsEnabled = ?'); values.push(habit.notificationsEnabled); }
  if (habit.notificationTime !== undefined) { fields.push('notificationTime = ?'); values.push(habit.notificationTime || null); }
  if (habit.profileId !== undefined) { fields.push('profileId = ?'); values.push(habit.profileId); }
  
  if (fields.length === 0) return;
  
  values.push(habit.id);
  await database.runAsync(
    `UPDATE habits SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

// ==================== REWARD OPERATIONS ====================

export interface RewardRow {
  id: string;
  name: string;
  icon: string;
  cost: number;
  color: string;
  createdAt: string;
  profileId: string | null;
  deletedAt: string | null;
}

export async function getAllRewards(profileId?: string, includeArchived = false): Promise<RewardRow[]> {
  const database = await getDatabase();
  if (profileId) {
    const query = includeArchived
      ? "SELECT * FROM rewards WHERE profileId = ? ORDER BY createdAt DESC"
      : "SELECT * FROM rewards WHERE profileId = ? AND deletedAt IS NULL ORDER BY createdAt DESC";
    return await database.getAllAsync<RewardRow>(query, [profileId]);
  }
  const query = includeArchived
    ? "SELECT * FROM rewards ORDER BY createdAt DESC"
    : "SELECT * FROM rewards WHERE deletedAt IS NULL ORDER BY createdAt DESC";
  return await database.getAllAsync<RewardRow>(query);
}

export async function insertReward(reward: {
  id: string;
  name: string;
  icon: string;
  cost: number;
  color: string;
  createdAt: string;
  profileId: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO rewards (id, name, icon, cost, color, createdAt, profileId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [reward.id, reward.name, reward.icon, reward.cost, reward.color, reward.createdAt, reward.profileId]
  );
}

export async function archiveReward(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE rewards SET deletedAt = datetime('now') WHERE id = ?",
    [id]
  );
}

export async function removeReward(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM redemptions WHERE rewardId = ?", [id]);
  await database.runAsync("DELETE FROM rewards WHERE id = ?", [id]);
}

export async function getRewardById(id: string): Promise<RewardRow | null> {
  const database = await getDatabase();
  return await database.getFirstAsync<RewardRow>("SELECT * FROM rewards WHERE id = ?", [id]);
}

export async function updateReward(reward: {
  id: string;
  name?: string;
  icon?: string;
  cost?: number;
  color?: string;
  profileId?: string;
}): Promise<void> {
  const database = await getDatabase();
  
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (reward.name !== undefined) { fields.push('name = ?'); values.push(reward.name); }
  if (reward.icon !== undefined) { fields.push('icon = ?'); values.push(reward.icon); }
  if (reward.cost !== undefined) { fields.push('cost = ?'); values.push(reward.cost); }
  if (reward.color !== undefined) { fields.push('color = ?'); values.push(reward.color); }
  if (reward.profileId !== undefined) { fields.push('profileId = ?'); values.push(reward.profileId); }
  
  if (fields.length === 0) return;
  
  values.push(reward.id);
  await database.runAsync(
    `UPDATE rewards SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

// ==================== COMPLETION OPERATIONS ====================

export interface CompletionRow {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
  profileId: string | null;
}

export async function getAllCompletions(profileId?: string): Promise<CompletionRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<CompletionRow>(
      "SELECT * FROM completions WHERE profileId = ? ORDER BY completedAt DESC", 
      [profileId]
    );
  }
  return await database.getAllAsync<CompletionRow>("SELECT * FROM completions ORDER BY completedAt DESC");
}

export async function getCompletionsForHabit(habitId: string, profileId: string): Promise<CompletionRow[]> {
  const database = await getDatabase();
  return await database.getAllAsync<CompletionRow>(
    "SELECT * FROM completions WHERE habitId = ? AND profileId = ? ORDER BY completedAt DESC",
    [habitId, profileId]
  );
}

export async function getTodayCompletionForHabit(
  habitId: string, 
  profileId: string,
  date: string
): Promise<CompletionRow | null> {
  const database = await getDatabase();
  return await database.getFirstAsync<CompletionRow>(
    "SELECT * FROM completions WHERE habitId = ? AND profileId = ? AND date(completedAt) = date(?) LIMIT 1",
    [habitId, profileId, date]
  );
}

export async function insertCompletion(completion: {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
  profileId: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO completions (id, habitId, habitName, coinReward, completedAt, profileId) VALUES (?, ?, ?, ?, ?, ?)`,
    [completion.id, completion.habitId, completion.habitName, completion.coinReward, completion.completedAt, completion.profileId]
  );
}

export async function removeCompletion(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM completions WHERE id = ?", [id]);
}

export async function removeCompletionForHabitToday(
  habitId: string, 
  profileId: string,
  date: string
): Promise<CompletionRow | null> {
  const database = await getDatabase();
  const completion = await getTodayCompletionForHabit(habitId, profileId, date);
  if (completion) {
    await database.runAsync("DELETE FROM completions WHERE id = ?", [completion.id]);
  }
  return completion;
}

// ==================== REDEMPTION OPERATIONS ====================

export interface RedemptionRow {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
  profileId: string | null;
}

export async function getAllRedemptions(profileId?: string): Promise<RedemptionRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<RedemptionRow>(
      "SELECT * FROM redemptions WHERE profileId = ? ORDER BY redeemedAt DESC", 
      [profileId]
    );
  }
  return await database.getAllAsync<RedemptionRow>("SELECT * FROM redemptions ORDER BY redeemedAt DESC");
}

export async function insertRedemption(redemption: {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
  profileId: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO redemptions (id, rewardId, rewardName, cost, redeemedAt, profileId) VALUES (?, ?, ?, ?, ?, ?)`,
    [redemption.id, redemption.rewardId, redemption.rewardName, redemption.cost, redemption.redeemedAt, redemption.profileId]
  );
}

// ==================== WALLET OPERATIONS ====================

export interface WalletRow {
  profileId: string;
  balance: number;
}

export async function getWalletBalance(profileId: string): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<WalletRow>(
    "SELECT * FROM wallet WHERE profileId = ?", 
    [profileId]
  );
  return result?.balance ?? 0;
}

export async function setWalletBalance(balance: number, profileId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE wallet SET balance = ? WHERE profileId = ?", 
    [Math.max(0, balance), profileId]
  );
}

export async function addToWalletBalance(amount: number, profileId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "UPDATE wallet SET balance = balance + ? WHERE profileId = ?",
    [amount, profileId]
  );
}

export async function deductFromWalletBalance(amount: number, profileId: string): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<WalletRow>(
    "SELECT balance FROM wallet WHERE profileId = ?",
    [profileId]
  );
  
  if (!result || result.balance < amount) {
    return false; // Insufficient balance
  }
  
  await database.runAsync(
    "UPDATE wallet SET balance = balance - ? WHERE profileId = ?",
    [amount, profileId]
  );
  return true;
}

// ==================== ACHIEVEMENT OPERATIONS ====================

export interface AchievementRow {
  id: string;
  trophyId: string;
  unlockedAt: string;
  profileId: string | null;
}

export async function getUnlockedAchievements(profileId?: string): Promise<AchievementRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<AchievementRow>(
      "SELECT * FROM achievements WHERE profileId = ? ORDER BY unlockedAt DESC", 
      [profileId]
    );
  }
  return await database.getAllAsync<AchievementRow>("SELECT * FROM achievements ORDER BY unlockedAt DESC");
}

export async function insertAchievement(achievement: {
  id: string;
  trophyId: string;
  unlockedAt: string;
  profileId: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "INSERT OR IGNORE INTO achievements (id, trophyId, unlockedAt, profileId) VALUES (?, ?, ?, ?)",
    [achievement.id, achievement.trophyId, achievement.unlockedAt, achievement.profileId]
  );
}

export async function isAchievementUnlocked(trophyId: string, profileId?: string): Promise<boolean> {
  const database = await getDatabase();
  if (profileId) {
    const result = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM achievements WHERE trophyId = ? AND profileId = ?",
      [trophyId, profileId]
    );
    return (result?.count ?? 0) > 0;
  }
  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM achievements WHERE trophyId = ?",
    [trophyId]
  );
  return (result?.count ?? 0) > 0;
}

// ==================== USER STATS OPERATIONS ====================

export interface UserStatsRow {
  profileId: string;
  totalCompletions: number;
  longestStreak: number;
  longestSingleHabitStreak: number;
  longestSingleHabitId: string | null;
}

export async function getUserStats(profileId: string): Promise<UserStatsRow> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<UserStatsRow>(
    "SELECT * FROM user_stats WHERE profileId = ?", 
    [profileId]
  );
  return result || { 
    profileId, 
    totalCompletions: 0, 
    longestStreak: 0, 
    longestSingleHabitStreak: 0, 
    longestSingleHabitId: null 
  };
}

export async function updateUserStats(
  stats: {
    totalCompletions?: number;
    longestStreak?: number;
    longestSingleHabitStreak?: number;
    longestSingleHabitId?: string | null;
  }, 
  profileId: string
): Promise<void> {
  const database = await getDatabase();
  
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (stats.totalCompletions !== undefined) { 
    fields.push('totalCompletions = totalCompletions + ?'); 
    values.push(stats.totalCompletions);
  }
  if (stats.longestStreak !== undefined) { 
    fields.push('longestStreak = ?'); 
    values.push(stats.longestStreak);
  }
  if (stats.longestSingleHabitStreak !== undefined) { 
    fields.push('longestSingleHabitStreak = ?'); 
    values.push(stats.longestSingleHabitStreak);
  }
  if (stats.longestSingleHabitId !== undefined) { 
    fields.push('longestSingleHabitId = ?'); 
    values.push(stats.longestSingleHabitId);
  }
  
  if (fields.length === 0) return;
  
  values.push(profileId);
  await database.runAsync(
    `UPDATE user_stats SET ${fields.join(', ')} WHERE profileId = ?`,
    values
  );
}

// ==================== PURCHASED SKILLS OPERATIONS ====================

export interface PurchasedSkillRow {
  id: string;
  skillId: string;
  profileId: string | null;
  purchasedAt: string;
}

export async function getPurchasedSkills(profileId?: string): Promise<PurchasedSkillRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<PurchasedSkillRow>(
      "SELECT * FROM purchased_skills WHERE profileId = ? ORDER BY purchasedAt DESC", 
      [profileId]
    );
  }
  return await database.getAllAsync<PurchasedSkillRow>("SELECT * FROM purchased_skills ORDER BY purchasedAt DESC");
}

export async function insertPurchasedSkill(skill: {
  id: string;
  skillId: string;
  profileId: string;
  purchasedAt: string;
}): Promise<boolean> {
  const database = await getDatabase();
  try {
    await database.runAsync(
      "INSERT INTO purchased_skills (id, skillId, profileId, purchasedAt) VALUES (?, ?, ?, ?)",
      [skill.id, skill.skillId, skill.profileId, skill.purchasedAt]
    );
    return true;
  } catch (error: any) {
    // UNIQUE constraint violation - skill already purchased
    if (error.message?.includes('UNIQUE constraint failed')) {
      return false;
    }
    throw error;
  }
}

export async function isSkillPurchased(skillId: string, profileId: string): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM purchased_skills WHERE skillId = ? AND profileId = ?",
    [skillId, profileId]
  );
  return (result?.count ?? 0) > 0;
}
