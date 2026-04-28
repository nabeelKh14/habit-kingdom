import * as SQLite from "expo-sqlite";
import { drizzle, ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { eq, and, isNull, desc, sql, or } from "drizzle-orm";
import * as schema from "../shared/schema";
import { runMigrations } from "./migrations";

let db: ExpoSQLiteDatabase<typeof schema> | null = null;

export function getDbInstance(): ExpoSQLiteDatabase<typeof schema> | null {
  return db;
}

export async function getDatabase(): Promise<ExpoSQLiteDatabase<typeof schema>> {
  if (db) return db;

  try {
    const sqliteDb = await SQLite.openDatabaseAsync("kidhabit.db");
    await sqliteDb.execAsync("PRAGMA foreign_keys = ON;");

    db = drizzle(sqliteDb, { schema });

    // Run migrations
    await runMigrations(sqliteDb);

    console.log("[DB] Database initialized successfully with Drizzle ORM");
    return db;
  } catch (error) {
    console.error("[DB] Database initialization failed:", error);
    throw error;
  }
}

// Check if database is available
export function isDatabaseAvailable(): boolean {
  return db !== null;
}

// Transaction wrapper for atomic operations
export async function withTransaction<T>(
  operations: (db: ExpoSQLiteDatabase<typeof schema>) => Promise<T>
): Promise<T> {
  const database = await getDatabase();
  try {
    await database.run("BEGIN TRANSACTION");
    const result = await operations(database);
    await database.run("COMMIT");
    return result;
  } catch (error) {
    await database.run("ROLLBACK");
    throw error;
  }
}

// ==================== PROFILE OPERATIONS ====================

export type ProfileRow = typeof schema.profiles.$inferSelect;

export async function getAllProfiles(): Promise<ProfileRow[]> {
  const database = await getDatabase();
  return await database.select().from(schema.profiles).orderBy(schema.profiles.createdAt);
}

export async function insertProfile(profile: {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.insert(schema.profiles).values({
    ...profile,
    type: profile.type as "child" | "parent",
  } as typeof schema.profiles.$inferInsert);
  await database.insert(schema.wallet).values({ profileId: profile.id, balance: 0 }).onConflictDoNothing();
  await database.insert(schema.userStats).values({
    profileId: profile.id,
    totalCompletions: 0,
    longestStreak: 0,
    longestSingleHabitStreak: 0,
  }).onConflictDoNothing();
}

export async function updateProfile(id: string, name: string): Promise<void> {
  const database = await getDatabase();
  await database.update(schema.profiles).set({ name }).where(eq(schema.profiles.id, id));
}

export async function removeProfile(id: string): Promise<void> {
  if (id === "default") {
    throw new Error("Cannot delete the default profile");
  }

  const database = await getDatabase();

  const profile = await database.select({ id: schema.profiles.id, type: schema.profiles.type })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, id))
    .limit(1);

  if (!profile.length) {
    return;
  }

  if (profile[0].type === "child") {
    // Child profile: cascade delete
    await database.delete(schema.habits).where(eq(schema.habits.profileId, id));
    await database.delete(schema.rewards).where(eq(schema.rewards.profileId, id));
    await database.delete(schema.completions).where(eq(schema.completions.profileId, id));
    await database.delete(schema.redemptions).where(eq(schema.redemptions.profileId, id));
    await database.delete(schema.achievements).where(eq(schema.achievements.profileId, id));
    await database.delete(schema.userStats).where(eq(schema.userStats.profileId, id));
    await database.delete(schema.wallet).where(eq(schema.wallet.profileId, id));
    await database.delete(schema.purchasedSkills).where(eq(schema.purchasedSkills.profileId, id));
  } else {
    // Parent profile: reassign to default
    const reassignTo = "default";
    await database.update(schema.habits).set({ profileId: reassignTo }).where(eq(schema.habits.profileId, id));
    await database.update(schema.rewards).set({ profileId: reassignTo }).where(eq(schema.rewards.profileId, id));
    await database.update(schema.completions).set({ profileId: reassignTo }).where(eq(schema.completions.profileId, id));
    await database.update(schema.redemptions).set({ profileId: reassignTo }).where(eq(schema.redemptions.profileId, id));
    await database.update(schema.achievements).set({ profileId: reassignTo }).where(eq(schema.achievements.profileId, id));
    await database.update(schema.userStats).set({ profileId: reassignTo }).where(eq(schema.userStats.profileId, id));
    await database.update(schema.wallet).set({ profileId: reassignTo }).where(eq(schema.wallet.profileId, id));
    await database.update(schema.purchasedSkills).set({ profileId: reassignTo }).where(eq(schema.purchasedSkills.profileId, id));
  }

  await database.delete(schema.profiles).where(eq(schema.profiles.id, id));
}

export async function getProfileSettings(): Promise<{ maxParents: number; maxChildren: number }> {
  const database = await getDatabase();
  const result = await database.select().from(schema.profileSettings).where(eq(schema.profileSettings.id, 1)).limit(1);
  return result[0] || { maxParents: 2, maxChildren: 1 };
}

// ==================== HABIT OPERATIONS ====================

export type HabitRow = typeof schema.habits.$inferSelect;

export async function getAllHabits(profileId?: string, includeArchived = false): Promise<HabitRow[]> {
  const database = await getDatabase();

  const query = database.select().from(schema.habits);

  if (profileId) {
    if (!includeArchived) {
      return await query.where(and(eq(schema.habits.profileId, profileId), isNull(schema.habits.deletedAt))).orderBy(desc(schema.habits.createdAt));
    }
    return await query.where(eq(schema.habits.profileId, profileId)).orderBy(desc(schema.habits.createdAt));
  }

  if (!includeArchived) {
    return await query.where(isNull(schema.habits.deletedAt)).orderBy(desc(schema.habits.createdAt));
  }

  return await query.orderBy(desc(schema.habits.createdAt));
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
  await database.insert(schema.habits).values({
    ...habit,
    frequency: habit.frequency as "once" | "daily" | "weekly" | "monthly",
    notificationsEnabled: habit.notificationsEnabled ?? 0,
  } as typeof schema.habits.$inferInsert);
}

export async function archiveHabit(id: string): Promise<void> {
  const database = await getDatabase();
  await database.update(schema.habits).set({ deletedAt: new Date().toISOString() }).where(eq(schema.habits.id, id));
}

export async function restoreHabit(id: string): Promise<void> {
  const database = await getDatabase();
  await database.update(schema.habits).set({ deletedAt: null }).where(eq(schema.habits.id, id));
}

export async function removeHabit(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete(schema.completions).where(eq(schema.completions.habitId, id));
  await database.delete(schema.habits).where(eq(schema.habits.id, id));
}

export async function getHabitById(id: string): Promise<HabitRow | null> {
  const database = await getDatabase();
  const result = await database.select().from(schema.habits).where(eq(schema.habits.id, id)).limit(1);
  return result[0] || null;
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

  const setValues: Partial<typeof schema.habits.$inferInsert> = {};

  if (habit.name !== undefined) setValues.name = habit.name;
  if (habit.icon !== undefined) setValues.icon = habit.icon;
  if (habit.coinReward !== undefined) setValues.coinReward = habit.coinReward;
  if (habit.color !== undefined) setValues.color = habit.color;
  if (habit.frequency !== undefined) setValues.frequency = habit.frequency as "once" | "daily" | "weekly" | "monthly";
  if (habit.scheduledTime !== undefined) setValues.scheduledTime = habit.scheduledTime || null;
  if (habit.daysOfWeek !== undefined) setValues.daysOfWeek = habit.daysOfWeek || null;
  if (habit.dayOfMonth !== undefined) setValues.dayOfMonth = habit.dayOfMonth || null;
  if (habit.isPaused !== undefined) setValues.isPaused = habit.isPaused;
  if (habit.pauseUntil !== undefined) setValues.pauseUntil = habit.pauseUntil || null;
  if (habit.notificationsEnabled !== undefined) setValues.notificationsEnabled = habit.notificationsEnabled;
  if (habit.notificationTime !== undefined) setValues.notificationTime = habit.notificationTime || null;
  if (habit.profileId !== undefined) setValues.profileId = habit.profileId;

  if (Object.keys(setValues).length === 0) return;

  await database.update(schema.habits).set(setValues).where(eq(schema.habits.id, habit.id));
}

// ==================== REWARD OPERATIONS ====================

export type RewardRow = typeof schema.rewards.$inferSelect;

export async function getAllRewards(profileId?: string, includeArchived = false): Promise<RewardRow[]> {
  const database = await getDatabase();

  const query = database.select().from(schema.rewards);

  if (profileId) {
    if (!includeArchived) {
      return await query.where(and(eq(schema.rewards.profileId, profileId), isNull(schema.rewards.deletedAt))).orderBy(desc(schema.rewards.createdAt));
    }
    return await query.where(eq(schema.rewards.profileId, profileId)).orderBy(desc(schema.rewards.createdAt));
  }

  if (!includeArchived) {
    return await query.where(isNull(schema.rewards.deletedAt)).orderBy(desc(schema.rewards.createdAt));
  }

  return await query.orderBy(desc(schema.rewards.createdAt));
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
  await database.insert(schema.rewards).values(reward);
}

export async function archiveReward(id: string): Promise<void> {
  const database = await getDatabase();
  await database.update(schema.rewards).set({ deletedAt: new Date().toISOString() }).where(eq(schema.rewards.id, id));
}

export async function removeReward(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete(schema.redemptions).where(eq(schema.redemptions.rewardId, id));
  await database.delete(schema.rewards).where(eq(schema.rewards.id, id));
}

export async function getRewardById(id: string): Promise<RewardRow | null> {
  const database = await getDatabase();
  const result = await database.select().from(schema.rewards).where(eq(schema.rewards.id, id)).limit(1);
  return result[0] || null;
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

  const setValues: Partial<typeof schema.rewards.$inferInsert> = {};

  if (reward.name !== undefined) setValues.name = reward.name;
  if (reward.icon !== undefined) setValues.icon = reward.icon;
  if (reward.cost !== undefined) setValues.cost = reward.cost;
  if (reward.color !== undefined) setValues.color = reward.color;
  if (reward.profileId !== undefined) setValues.profileId = reward.profileId;

  if (Object.keys(setValues).length === 0) return;

  await database.update(schema.rewards).set(setValues).where(eq(schema.rewards.id, reward.id));
}

// ==================== COMPLETION OPERATIONS ====================

export type CompletionRow = typeof schema.completions.$inferSelect;

export async function getAllCompletions(profileId?: string): Promise<CompletionRow[]> {
  const database = await getDatabase();

  if (profileId) {
    return await database.select().from(schema.completions)
      .where(eq(schema.completions.profileId, profileId))
      .orderBy(desc(schema.completions.completedAt));
  }

  return await database.select().from(schema.completions).orderBy(desc(schema.completions.completedAt));
}

export async function getCompletionsForHabit(habitId: string, profileId: string): Promise<CompletionRow[]> {
  const database = await getDatabase();
  return await database.select().from(schema.completions)
    .where(and(eq(schema.completions.habitId, habitId), eq(schema.completions.profileId, profileId)))
    .orderBy(desc(schema.completions.completedAt));
}

export async function getTodayCompletionForHabit(
  habitId: string,
  profileId: string,
  date: string
): Promise<CompletionRow | null> {
  const database = await getDatabase();
  const result = await database.select().from(schema.completions)
    .where(
      and(
        eq(schema.completions.habitId, habitId),
        eq(schema.completions.profileId, profileId),
        sql`date(${schema.completions.completedAt}) = date(${date})`
      )
    )
    .limit(1);
  return result[0] || null;
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
  await database.insert(schema.completions).values(completion);
}

export async function removeCompletion(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete(schema.completions).where(eq(schema.completions.id, id));
}

export async function removeCompletionForHabitToday(
  habitId: string,
  profileId: string,
  date: string
): Promise<CompletionRow | null> {
  const database = await getDatabase();
  const completion = await getTodayCompletionForHabit(habitId, profileId, date);
  if (completion) {
    await database.delete(schema.completions).where(eq(schema.completions.id, completion.id));
  }
  return completion;
}

// ==================== REDEMPTION OPERATIONS ====================

export type RedemptionRow = typeof schema.redemptions.$inferSelect;

export async function getAllRedemptions(profileId?: string): Promise<RedemptionRow[]> {
  const database = await getDatabase();

  if (profileId) {
    return await database.select().from(schema.redemptions)
      .where(eq(schema.redemptions.profileId, profileId))
      .orderBy(desc(schema.redemptions.redeemedAt));
  }

  return await database.select().from(schema.redemptions).orderBy(desc(schema.redemptions.redeemedAt));
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
  await database.insert(schema.redemptions).values(redemption);
}

// ==================== WALLET OPERATIONS ====================

export type WalletRow = typeof schema.wallet.$inferSelect;

export async function getWalletBalance(profileId: string): Promise<number> {
  const database = await getDatabase();
  const result = await database.select().from(schema.wallet).where(eq(schema.wallet.profileId, profileId)).limit(1);
  return result[0]?.balance ?? 0;
}

export async function setWalletBalance(balance: number, profileId: string): Promise<void> {
  const database = await getDatabase();
  await database.update(schema.wallet).set({ balance: Math.max(0, balance) }).where(eq(schema.wallet.profileId, profileId));
}

export async function addToWalletBalance(amount: number, profileId: string): Promise<void> {
  const database = await getDatabase();
  await database.update(schema.wallet).set({ balance: sql`${schema.wallet.balance} + ${amount}` }).where(eq(schema.wallet.profileId, profileId));
}

export async function deductFromWalletBalance(amount: number, profileId: string): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.select({ balance: schema.wallet.balance }).from(schema.wallet).where(eq(schema.wallet.profileId, profileId)).limit(1);

  if (!result[0] || result[0].balance < amount) {
    return false;
  }

  await database.update(schema.wallet).set({ balance: sql`${schema.wallet.balance} - ${amount}` }).where(eq(schema.wallet.profileId, profileId));
  return true;
}

// ==================== ACHIEVEMENT OPERATIONS ====================

export type AchievementRow = typeof schema.achievements.$inferSelect;

export async function getUnlockedAchievements(profileId?: string): Promise<AchievementRow[]> {
  const database = await getDatabase();

  if (profileId) {
    return await database.select().from(schema.achievements)
      .where(eq(schema.achievements.profileId, profileId))
      .orderBy(desc(schema.achievements.unlockedAt));
  }

  return await database.select().from(schema.achievements).orderBy(desc(schema.achievements.unlockedAt));
}

export async function insertAchievement(achievement: {
  id: string;
  trophyId: string;
  unlockedAt: string;
  profileId: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.insert(schema.achievements).values(achievement).onConflictDoNothing();
}

export async function isAchievementUnlocked(trophyId: string, profileId?: string): Promise<boolean> {
  const database = await getDatabase();

  const conditions = [eq(schema.achievements.trophyId, trophyId)];

  if (profileId) {
    conditions.push(eq(schema.achievements.profileId, profileId));
  }

  const result = await database.select({ count: sql<number>`count(*)` })
    .from(schema.achievements)
    .where(and(...conditions));

  return (result[0]?.count ?? 0) > 0;
}

// ==================== USER STATS OPERATIONS ====================

export type UserStatsRow = typeof schema.userStats.$inferSelect;

export async function getUserStats(profileId: string): Promise<UserStatsRow> {
  const database = await getDatabase();
  const result = await database.select().from(schema.userStats).where(eq(schema.userStats.profileId, profileId)).limit(1);
  return result[0] || {
    profileId,
    totalCompletions: 0,
    longestStreak: 0,
    longestSingleHabitStreak: 0,
    longestSingleHabitId: null,
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

  if (stats.totalCompletions !== undefined) {
    await database.update(schema.userStats)
      .set({ totalCompletions: sql`${schema.userStats.totalCompletions} + ${stats.totalCompletions}` })
      .where(eq(schema.userStats.profileId, profileId));
  }

  const setValues: Partial<typeof schema.userStats.$inferInsert> = {};

  if (stats.longestStreak !== undefined) setValues.longestStreak = stats.longestStreak;
  if (stats.longestSingleHabitStreak !== undefined) setValues.longestSingleHabitStreak = stats.longestSingleHabitStreak;
  if (stats.longestSingleHabitId !== undefined) setValues.longestSingleHabitId = stats.longestSingleHabitId;

  if (Object.keys(setValues).length ===0) return;

  await database.update(schema.userStats).set(setValues).where(eq(schema.userStats.profileId, profileId));
}

// ==================== PURCHASED SKILLS OPERATIONS ====================

export type PurchasedSkillRow = typeof schema.purchasedSkills.$inferSelect;

export async function getPurchasedSkills(profileId?: string): Promise<PurchasedSkillRow[]> {
  const database = await getDatabase();

  if (profileId) {
    return await database.select().from(schema.purchasedSkills)
      .where(eq(schema.purchasedSkills.profileId, profileId))
      .orderBy(desc(schema.purchasedSkills.purchasedAt));
  }

  return await database.select().from(schema.purchasedSkills).orderBy(desc(schema.purchasedSkills.purchasedAt));
}

export async function insertPurchasedSkill(skill: {
  id: string;
  skillId: string;
  profileId: string;
  purchasedAt: string;
}): Promise<boolean> {
  const database = await getDatabase();
  try {
    await database.insert(schema.purchasedSkills).values(skill);
    return true;
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint failed")) {
      return false;
    }
    throw error;
  }
}

export async function isSkillPurchased(skillId: string, profileId: string): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.select({ count: sql<number>`count(*)` })
    .from(schema.purchasedSkills)
    .where(and(eq(schema.purchasedSkills.skillId, skillId), eq(schema.purchasedSkills.profileId, profileId)));
  return (result[0]?.count ?? 0) > 0;
}
