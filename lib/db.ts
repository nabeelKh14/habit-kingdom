import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  
  try {
    db = await SQLite.openDatabaseAsync("kidhabit.db");
    await initializeTables(db);
    return db;
  } catch (error) {
    console.error('[DB] Database initialization failed:', error);
    throw error;
  }
}

async function initializeTables(database: SQLite.SQLiteDatabase): Promise<void> {
   // Create profiles table
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS profiles (
       id TEXT PRIMARY KEY NOT NULL,
       name TEXT NOT NULL,
       type TEXT NOT NULL,
       createdAt TEXT NOT NULL
     );
   `);
   
   // Create index for profiles table
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_profiles_type ON profiles(type);
   `);

   // Create habits table
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
       profileId TEXT
     );
   `);
   
   // Create indexes for habits table for better query performance
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_habits_profileId ON habits(profileId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_habits_createdAt ON habits(createdAt);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_habits_frequency ON habits(frequency);
   `);

   // Create rewards table
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS rewards (
       id TEXT PRIMARY KEY NOT NULL,
       name TEXT NOT NULL,
       icon TEXT NOT NULL,
       cost INTEGER NOT NULL,
       color TEXT NOT NULL,
       createdAt TEXT NOT NULL,
       profileId TEXT
     );
   `);
   
   // Create indexes for rewards table for better query performance
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_rewards_profileId ON rewards(profileId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_rewards_createdAt ON rewards(createdAt);
   `);

   // Create completions table
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS completions (
       id TEXT PRIMARY KEY NOT NULL,
       habitId TEXT NOT NULL,
       habitName TEXT NOT NULL,
       coinReward INTEGER NOT NULL,
       completedAt TEXT NOT NULL,
       profileId TEXT
     );
   `);
   
   // Create indexes for completions table for better query performance
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_completions_profileId ON completions(profileId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_completions_habitId ON completions(habitId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_completions_completedAt ON completions(completedAt);
   `);

   // Create redemptions table
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS redemptions (
       id TEXT PRIMARY KEY NOT NULL,
       rewardId TEXT NOT NULL,
       rewardName TEXT NOT NULL,
       cost INTEGER NOT NULL,
       redeemedAt TEXT NOT NULL,
       profileId TEXT
     );
   `);
   
   // Create indexes for redemptions table for better query performance
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_redemptions_profileId ON redemptions(profileId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_redemptions_rewardId ON redemptions(rewardId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_redemptions_redeemedAt ON redemptions(redeemedAt);
   `);

   // Create wallet table - now per profile
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS wallet (
       profileId TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
       balance INTEGER DEFAULT 0
     );
   `);
   
   // Create index for wallet table (though it's primary key, explicit is fine)
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_wallet_profileId ON wallet(profileId);
   `);

  // Initialize default wallet if not exists
  await database.runAsync(`
    INSERT OR IGNORE INTO wallet (profileId, balance) VALUES ('default', 0);
  `);

   // Create achievements table
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS achievements (
       id TEXT PRIMARY KEY NOT NULL,
       trophyId TEXT NOT NULL,
       unlockedAt TEXT NOT NULL,
       profileId TEXT
     );
   `);
   
   // Create indexes for achievements table for better query performance
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_achievements_profileId ON achievements(profileId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_achievements_trophyId ON achievements(trophyId);
   `);
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_achievements_unlockedAt ON achievements(unlockedAt);
   `);

   // Create user stats table for tracking streaks and completions - now per profile
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS user_stats (
       profileId TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
       totalCompletions INTEGER DEFAULT 0,
       longestStreak INTEGER DEFAULT 0,
       longestSingleHabitStreak INTEGER DEFAULT 0,
       longestSingleHabitId TEXT
     );
   `);
   
   // Create index for user stats table (though it's primary key, explicit is fine)
   await database.execAsync(`
     CREATE INDEX IF NOT EXISTS idx_userStats_profileId ON user_stats(profileId);
   `);

   // Apply migrations for optional columns that might be missing in older installs
   const migrations = [
     "ALTER TABLE habits ADD COLUMN frequency TEXT DEFAULT 'once';",
     "ALTER TABLE habits ADD COLUMN scheduledTime TEXT;",
     "ALTER TABLE habits ADD COLUMN daysOfWeek TEXT;",
     "ALTER TABLE habits ADD COLUMN dayOfMonth INTEGER;",
     "ALTER TABLE habits ADD COLUMN isPaused INTEGER DEFAULT 0;",
     "ALTER TABLE habits ADD COLUMN pauseUntil TEXT;",
     "ALTER TABLE habits ADD COLUMN notificationsEnabled INTEGER DEFAULT 0;",
     "ALTER TABLE habits ADD COLUMN notificationTime TEXT;",
     "ALTER TABLE habits ADD COLUMN profileId TEXT;",
     "ALTER TABLE rewards ADD COLUMN profileId TEXT;",
     "ALTER TABLE completions ADD COLUMN profileId TEXT;",
     "ALTER TABLE redemptions ADD COLUMN profileId TEXT;",
     "ALTER TABLE user_stats ADD COLUMN profileId TEXT;",
     "ALTER TABLE achievements ADD COLUMN profileId TEXT;"
   ];

  for (const query of migrations) {
    try {
      await database.execAsync(query);
    } catch (e: any) {
      if (!e.message.includes('duplicate column name')) {
        console.error('[DB] Migration failed:', query, e);
      }
    }
  }

   // Migrate existing habits/rewards/completions to have profileId = 'default'
   await database.execAsync(`UPDATE habits SET profileId = 'default' WHERE profileId IS NULL;`);
   await database.execAsync(`UPDATE rewards SET profileId = 'default' WHERE profileId IS NULL;`);
   await database.execAsync(`UPDATE completions SET profileId = 'default' WHERE profileId IS NULL;`);
   await database.execAsync(`UPDATE redemptions SET profileId = 'default' WHERE profileId IS NULL;`);
   await database.execAsync(`UPDATE user_stats SET profileId = 'default' WHERE profileId IS NULL;`);
   await database.execAsync(`UPDATE wallet SET profileId = 'default' WHERE profileId IS NULL;`);

  // Initialize default user stats if not exists
  await database.runAsync(`
    INSERT OR IGNORE INTO user_stats (profileId, totalCompletions, longestStreak, longestSingleHabitStreak) VALUES ('default', 0, 0, 0);
  `);

   // Create purchased skills table
   await database.execAsync(`
     CREATE TABLE IF NOT EXISTS purchased_skills (
       id TEXT PRIMARY KEY NOT NULL,
       skillId TEXT NOT NULL,
       profileId TEXT,
       purchasedAt TEXT NOT NULL
     );
   `);

   // Migrate existing purchased_skills to have profileId = 'default'
   await database.execAsync(`UPDATE purchased_skills SET profileId = 'default' WHERE profileId IS NULL;`);
}

// Profile CRUD operations
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
  // Initialize wallet and stats for the profile
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
  // Prevent deletion of the default profile
  if (id === 'default') {
    throw new Error('Cannot delete the default profile');
  }
  
  const database = await getDatabase();
  
  // Delete related data first to avoid foreign key constraint issues
  await database.runAsync("DELETE FROM habits WHERE profileId = ?", [id]);
  await database.runAsync("DELETE FROM rewards WHERE profileId = ?", [id]);
  await database.runAsync("DELETE FROM completions WHERE profileId = ?", [id]);
  await database.runAsync("DELETE FROM redemptions WHERE profileId = ?", [id]);
  await database.runAsync("DELETE FROM achievements WHERE profileId = ?", [id]);
  await database.runAsync("DELETE FROM user_stats WHERE profileId = ?", [id]);
  await database.runAsync("DELETE FROM wallet WHERE profileId = ?", [id]);
  await database.runAsync("DELETE FROM purchased_skills WHERE profileId = ?", [id]);
  
  // Finally delete the profile
  await database.runAsync("DELETE FROM profiles WHERE id = ?", [id]);
}

// Habit CRUD operations
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
}

export async function getAllHabits(profileId?: string): Promise<HabitRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<HabitRow>("SELECT * FROM habits WHERE profileId = ? ORDER BY createdAt DESC", [profileId]);
  }
  return await database.getAllAsync<HabitRow>("SELECT * FROM habits ORDER BY createdAt DESC");
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
  profileId?: string;
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
      habit.profileId || null,
    ]
  );
}

export async function removeHabit(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM habits WHERE id = ?", [id]);
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
  
  // Build dynamic update query
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
  if (habit.profileId !== undefined) { fields.push('profileId = ?'); values.push(habit.profileId || null); }
  
  if (fields.length === 0) return;
  
  values.push(habit.id);
  await database.runAsync(
    `UPDATE habits SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

// Reward CRUD operations
export interface RewardRow {
  id: string;
  name: string;
  icon: string;
  cost: number;
  color: string;
  createdAt: string;
  profileId: string | null;
}

export async function getAllRewards(profileId?: string): Promise<RewardRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<RewardRow>("SELECT * FROM rewards WHERE profileId = ? ORDER BY createdAt DESC", [profileId]);
  }
  return await database.getAllAsync<RewardRow>("SELECT * FROM rewards ORDER BY createdAt DESC");
}

export async function insertReward(reward: {
  id: string;
  name: string;
  icon: string;
  cost: number;
  color: string;
  createdAt: string;
  profileId?: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO rewards (id, name, icon, cost, color, createdAt, profileId) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [reward.id, reward.name, reward.icon, reward.cost, reward.color, reward.createdAt, reward.profileId || null]
  );
}

export async function removeReward(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM rewards WHERE id = ?", [id]);
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
  
  // Build dynamic update query
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (reward.name !== undefined) { fields.push('name = ?'); values.push(reward.name); }
  if (reward.icon !== undefined) { fields.push('icon = ?'); values.push(reward.icon); }
  if (reward.cost !== undefined) { fields.push('cost = ?'); values.push(reward.cost); }
  if (reward.color !== undefined) { fields.push('color = ?'); values.push(reward.color); }
  if (reward.profileId !== undefined) { fields.push('profileId = ?'); values.push(reward.profileId || null); }
  
  if (fields.length === 0) return;
  
  values.push(reward.id);
  await database.runAsync(
    `UPDATE rewards SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

// Completion CRUD operations
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
    return await database.getAllAsync<CompletionRow>("SELECT * FROM completions WHERE profileId = ? ORDER BY completedAt DESC", [profileId]);
  }
  return await database.getAllAsync<CompletionRow>("SELECT * FROM completions ORDER BY completedAt DESC");
}

export async function insertCompletion(completion: {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
  profileId?: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO completions (id, habitId, habitName, coinReward, completedAt, profileId) VALUES (?, ?, ?, ?, ?, ?)`,
    [completion.id, completion.habitId, completion.habitName, completion.coinReward, completion.completedAt, completion.profileId || null]
  );
}

export async function removeCompletion(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM completions WHERE id = ?", [id]);
}

// Redemption CRUD operations
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
    return await database.getAllAsync<RedemptionRow>("SELECT * FROM redemptions WHERE profileId = ? ORDER BY redeemedAt DESC", [profileId]);
  }
  return await database.getAllAsync<RedemptionRow>("SELECT * FROM redemptions ORDER BY redeemedAt DESC");
}

export async function insertRedemption(redemption: {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
  profileId?: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO redemptions (id, rewardId, rewardName, cost, redeemedAt, profileId) VALUES (?, ?, ?, ?, ?, ?)`,
    [redemption.id, redemption.rewardId, redemption.rewardName, redemption.cost, redemption.redeemedAt, redemption.profileId || null]
  );
}

// Wallet operations
export interface WalletRow {
  profileId: string;
  balance: number;
}

export async function getWalletBalance(profileId: string = 'default'): Promise<number> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<WalletRow>("SELECT * FROM wallet WHERE profileId = ?", [profileId]);
  return result?.balance ?? 0;
}

export async function setWalletBalance(balance: number, profileId: string = 'default'): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("UPDATE wallet SET balance = ? WHERE profileId = ?", [balance, profileId]);
}

// Achievement operations
export interface AchievementRow {
  id: string;
  trophyId: string;
  unlockedAt: string;
  profileId: string | null;
}

export async function getUnlockedAchievements(profileId?: string): Promise<AchievementRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<AchievementRow>("SELECT * FROM achievements WHERE profileId = ? ORDER BY unlockedAt DESC", [profileId]);
  }
  return await database.getAllAsync<AchievementRow>("SELECT * FROM achievements ORDER BY unlockedAt DESC");
}

export async function insertAchievement(achievement: {
  id: string;
  trophyId: string;
  unlockedAt: string;
  profileId?: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "INSERT INTO achievements (id, trophyId, unlockedAt, profileId) VALUES (?, ?, ?, ?)",
    [achievement.id, achievement.trophyId, achievement.unlockedAt, achievement.profileId || null]
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

// User stats operations
export interface UserStatsRow {
  profileId: string;
  totalCompletions: number;
  longestStreak: number;
  longestSingleHabitStreak: number;
  longestSingleHabitId: string | null;
}

export async function getUserStats(profileId: string = 'default'): Promise<UserStatsRow> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<UserStatsRow>("SELECT * FROM user_stats WHERE profileId = ?", [profileId]);
  return result || { profileId, totalCompletions: 0, longestStreak: 0, longestSingleHabitStreak: 0, longestSingleHabitId: null };
}

export async function updateUserStats(stats: {
  totalCompletions?: number;
  longestStreak?: number;
  longestSingleHabitStreak?: number;
  longestSingleHabitId?: string;
}, profileId: string = 'default'): Promise<void> {
  const database = await getDatabase();
  
  // Build dynamic update query
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

// Purchased skills operations
export interface PurchasedSkillRow {
  id: string;
  skillId: string;
  profileId: string | null;
  purchasedAt: string;
}

export async function getPurchasedSkills(profileId?: string): Promise<PurchasedSkillRow[]> {
  const database = await getDatabase();
  if (profileId) {
    return await database.getAllAsync<PurchasedSkillRow>("SELECT * FROM purchased_skills WHERE profileId = ? ORDER BY purchasedAt DESC", [profileId]);
  }
  return await database.getAllAsync<PurchasedSkillRow>("SELECT * FROM purchased_skills ORDER BY purchasedAt DESC");
}

export async function insertPurchasedSkill(skill: {
  id: string;
  skillId: string;
  profileId?: string;
  purchasedAt: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    "INSERT INTO purchased_skills (id, skillId, profileId, purchasedAt) VALUES (?, ?, ?, ?)",
    [skill.id, skill.skillId, skill.profileId || null, skill.purchasedAt]
  );
}
