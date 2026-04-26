import { sql } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== PROFILES ====================
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().$type<"child" | "parent">(),
  createdAt: text("createdAt").notNull(),
}, (table) => ({
  typeIdx: index("idx_profiles_type").on(table.type),
}));

export const insertProfileSchema = createInsertSchema(profiles, {
  type: z.enum(["child", "parent"]),
});
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;

// ==================== HABITS ====================
export const habits = sqliteTable("habits", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  coinReward: integer("coinReward").notNull(),
  color: text("color").notNull(),
  createdAt: text("createdAt").notNull(),
  frequency: text("frequency").default("once").$type<"once" | "daily" | "weekly" | "monthly">(),
  scheduledTime: text("scheduledTime"),
  daysOfWeek: text("daysOfWeek"), // JSON array of numbers
  dayOfMonth: integer("dayOfMonth"),
  isPaused: integer("isPaused").default(0),
  pauseUntil: text("pauseUntil"),
  notificationsEnabled: integer("notificationsEnabled").default(0),
  notificationTime: text("notificationTime"),
  profileId: text("profileId").notNull(),
  deletedAt: text("deletedAt"),
}, (table) => ({
  profileIdIdx: index("idx_habits_profileId").on(table.profileId),
  createdAtIdx: index("idx_habits_createdAt").on(table.createdAt),
  frequencyIdx: index("idx_habits_frequency").on(table.frequency),
  deletedAtIdx: index("idx_habits_deletedAt").on(table.deletedAt),
}));

export const insertHabitSchema = createInsertSchema(habits, {
  frequency: z.enum(["once", "daily", "weekly", "monthly"]),
});
export type InsertHabit = z.infer<typeof insertHabitSchema>;
export type Habit = typeof habits.$inferSelect;

// ==================== REWARDS ====================
export const rewards = sqliteTable("rewards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  cost: integer("cost").notNull(),
  color: text("color").notNull(),
  createdAt: text("createdAt").notNull(),
  profileId: text("profileId").notNull(),
  deletedAt: text("deletedAt"),
}, (table) => ({
  profileIdIdx: index("idx_rewards_profileId").on(table.profileId),
  createdAtIdx: index("idx_rewards_createdAt").on(table.createdAt),
  deletedAtIdx: index("idx_rewards_deletedAt").on(table.deletedAt),
}));

export const insertRewardSchema = createInsertSchema(rewards);
export type InsertReward = z.infer<typeof insertRewardSchema>;
export type Reward = typeof rewards.$inferSelect;

// ==================== COMPLETIONS ====================
export const completions = sqliteTable("completions", {
  id: text("id").primaryKey(),
  habitId: text("habitId").notNull(),
  habitName: text("habitName").notNull(),
  coinReward: integer("coinReward").notNull(),
  completedAt: text("completedAt").notNull(),
  profileId: text("profileId").notNull(),
}, (table) => ({
  profileIdIdx: index("idx_completions_profileId").on(table.profileId),
  habitIdIdx: index("idx_completions_habitId").on(table.habitId),
  completedAtIdx: index("idx_completions_completedAt").on(table.completedAt),
  profileCompletedIdx: index("idx_completions_profile_completed").on(table.profileId, table.completedAt),
}));

export const insertCompletionSchema = createInsertSchema(completions);
export type InsertCompletion = z.infer<typeof insertCompletionSchema>;
export type Completion = typeof completions.$inferSelect;

// ==================== REDEMPTIONS ====================
export const redemptions = sqliteTable("redemptions", {
  id: text("id").primaryKey(),
  rewardId: text("rewardId").notNull(),
  rewardName: text("rewardName").notNull(),
  cost: integer("cost").notNull(),
  redeemedAt: text("redeemedAt").notNull(),
  profileId: text("profileId").notNull(),
}, (table) => ({
  profileIdIdx: index("idx_redemptions_profileId").on(table.profileId),
  rewardIdIdx: index("idx_redemptions_rewardId").on(table.rewardId),
  redeemedAtIdx: index("idx_redemptions_redeemedAt").on(table.redeemedAt),
}));

export const insertRedemptionSchema = createInsertSchema(redemptions);
export type InsertRedemption = z.infer<typeof insertRedemptionSchema>;
export type Redemption = typeof redemptions.$inferSelect;

// ==================== WALLET ====================
export const wallet = sqliteTable("wallet", {
  profileId: text("profileId").primaryKey(),
  balance: integer("balance").default(0).notNull(),
});

export const insertWalletSchema = createInsertSchema(wallet);
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallet.$inferSelect;

// ==================== ACHIEVEMENTS ====================
export const achievements = sqliteTable("achievements", {
  id: text("id").primaryKey(),
  trophyId: text("trophyId").notNull(),
  unlockedAt: text("unlockedAt").notNull(),
  profileId: text("profileId").notNull(),
}, (table) => ({
  profileIdIdx: index("idx_achievements_profileId").on(table.profileId),
  trophyIdIdx: index("idx_achievements_trophyId").on(table.trophyId),
}));

export const insertAchievementSchema = createInsertSchema(achievements);
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Achievement = typeof achievements.$inferSelect;

// ==================== USER STATS ====================
export const userStats = sqliteTable("user_stats", {
  profileId: text("profileId").primaryKey(),
  totalCompletions: integer("totalCompletions").default(0).notNull(),
  longestStreak: integer("longestStreak").default(0).notNull(),
  longestSingleHabitStreak: integer("longestSingleHabitStreak").default(0).notNull(),
  longestSingleHabitId: text("longestSingleHabitId"),
});

export const insertUserStatsSchema = createInsertSchema(userStats);
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;
export type UserStats = typeof userStats.$inferSelect;

// ==================== PURCHASED SKILLS ====================
export const purchasedSkills = sqliteTable("purchased_skills", {
  id: text("id").primaryKey(),
  skillId: text("skillId").notNull(),
  profileId: text("profileId").notNull(),
  purchasedAt: text("purchasedAt").notNull(),
}, (table) => ({
  skillIdIdx: index("idx_purchased_skills_skillId").on(table.skillId),
  profileIdIdx: index("idx_purchased_skills_profileId").on(table.profileId),
  uniqueProfileSkill: uniqueIndex("idx_purchased_skills_unique").on(table.profileId, table.skillId),
}));

export const insertPurchasedSkillSchema = createInsertSchema(purchasedSkills);
export type InsertPurchasedSkill = z.infer<typeof insertPurchasedSkillSchema>;
export type PurchasedSkill = typeof purchasedSkills.$inferSelect;

// ==================== PROFILE SETTINGS ====================
export const profileSettings = sqliteTable("profile_settings", {
  id: integer("id").primaryKey(),
  maxParents: integer("maxParents").default(2).notNull(),
  maxChildren: integer("maxChildren").default(1).notNull(),
});

export const insertProfileSettingsSchema = createInsertSchema(profileSettings);
export type InsertProfileSettings = z.infer<typeof insertProfileSettingsSchema>;
export type ProfileSettings = typeof profileSettings.$inferSelect;

// ==================== USERS (for server auth) ====================
export const users = sqliteTable("users", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  username: text("username").notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  createdAt: text("createdAt").notNull(),
});

export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(3).max(50),
}).pick({
  username: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Re-export for backward compatibility
export type { InsertUser as InsertUserOld };
