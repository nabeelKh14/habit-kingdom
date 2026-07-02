/**
 * shared/types.ts — Canonical domain types for Habit Kingdom.
 *
 * These are the single source of truth for data shapes across
 * client (React Native), server (Express), and database (Drizzle/Supabase).
 *
 * Import pattern:
 *   Client:  import type { Habit, Profile, Reward } from "../shared/types";
 *   Server:  import type { Habit, UserSession } from "../shared/types";
 *   Drizzle: import { habitSchema } from "./schema"; // DB-specific shapes
 */

// ==================== PROFILES ====================

export interface Profile {
  id: string;
  name: string;
  type: "child" | "parent";
  createdAt: string;
}

// ==================== HABITS ====================

export type HabitFrequency = "once" | "daily" | "weekly" | "monthly";

export interface Habit {
  id: string;
  name: string;
  icon: string;
  coinReward: number;
  color: string;
  createdAt: string;
  frequency: HabitFrequency;
  scheduledTime?: string | null;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  isPaused?: boolean | null;
  pauseUntil?: string | null;
  notificationsEnabled?: boolean | null;
  notificationTime?: string | null;
  profileId?: string | null;
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
  profileId?: string;
}

// ==================== REWARDS ====================

export interface Reward {
  id: string;
  name: string;
  icon: string;
  cost: number;
  color: string;
  createdAt: string;
  profileId?: string;
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
  profileId?: string;
}

// ==================== WALLET & STATS ====================

export interface Wallet {
  profileId: string;
  balance: number;
}

export interface UserStats {
  totalCompletions: number;
  longestStreak: number;
  longestSingleHabitStreak: number;
  longestSingleHabitId: string | null;
}

// ==================== ACHIEVEMENTS ====================

export type TrophyType = "streak" | "completions" | "single_habit_streak";

export interface Trophy {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: TrophyType;
  requirement: number;
  emoji: string;
}

export interface UnlockedAchievement {
  id: string;
  trophyId: string;
  unlockedAt: string;
  profileId?: string;
}

// ==================== SKILLS ====================

export interface PurchasedSkill {
  id: string;
  skillId: string;
  profileId: string;
  purchasedAt: string;
}

// ==================== NOTIFICATIONS ====================

export interface PushToken {
  id?: string;
  profileId: string;
  token: string;
  platform: "ios" | "android";
  isActive: boolean;
  registeredAt: string;
}

export interface NotificationSettings {
  profileId: string;
  middayEnabled: boolean;
  middayTime: string;
  nightEnabled: boolean;
  nightTime: string;
  timezone: string;
}

// ==================== REMINDER SETTINGS (client-side) ====================

export interface ReminderSettings {
  middayEnabled: boolean;
  middayTime: string;
  nightEnabled: boolean;
  nightTime: string;
  bonusAmount: number;
  penaltyAmount: number;
}

// ==================== SYNC ====================

export interface RemoteRecord {
  table: string;
  id: string;
  profileId: string | null;
  data: Record<string, unknown>;
}

// ==================== SERVER AUTH ====================

export interface ServerUser {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserSession {
  token: string;
  userId: string;
  username: string;
  expiresAt: number;
}

// ==================== FEATURE FLAGS ====================

export enum FeatureFlag {
  SOCIAL_FEATURES = "social_features",
  CLOUD_SYNC = "cloud_sync",
  PARENT_CONTROLS = "parent_controls",
  DARK_MODE = "dark_mode",
  STRICT_MODERATION = "strict_moderation",
  CHILD_DATA_DELETION = "child_data_deletion",
  PARENT_ACCESS_CONTROL = "parent_access_control",
  LAZY_LOADING = "lazy_loading",
  IMAGE_OPTIMIZATION = "image_optimization",
  PAGINATION = "pagination",
  PUSH_NOTIFICATIONS = "push_notifications",
  HABIT_REMINDERS = "habit_reminders",
  STREAK_ALERTS = "streak_alerts",
  ANONYMOUS_ANALYTICS = "anonymous_analytics",
  CRASH_REPORTING = "crash_reporting",
}