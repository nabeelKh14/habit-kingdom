import * as Crypto from "expo-crypto";
import * as db from "./db";
import { validateHabitInput, validateRewardInput, validateCompletionInput, validateRedemptionInput, validateProfileInput } from "./validation";

// ==================== PROFILE MANAGEMENT ====================

export interface Profile {
  id: string;
  name: string;
  type: 'child' | 'parent';
  createdAt: string;
}

let activeProfileId: string | null = null;

export async function initializeProfiles(): Promise<void> {
  // Load profiles from storage to ensure data is initialized before usage
  const profiles = await getProfiles();
  if (profiles.length === 0) {
    // Create default profile if none exist
    await createProfile('Default', 'parent');
  }
}

export function setActiveProfileId(id: string): void {
  activeProfileId = id;
}

export function getActiveProfileId(): string {
  return activeProfileId || 'default';
}

export function getAllActiveProfileIds(): string[] {
  return activeProfileId ? [activeProfileId] : ['default'];
}

export async function getProfiles(): Promise<Profile[]> {
  try {
    const rows = await db.getAllProfiles();
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type as 'child' | 'parent',
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error('[ERROR] getProfiles failed:', error);
    return [];
  }
}

export async function createProfile(name: string, type: 'child' | 'parent'): Promise<Profile> {
  // Only allow one child profile
  if (type === 'child') {
    const existingProfiles = await getProfiles();
    const existingChild = existingProfiles.find(p => p.type === 'child');
    if (existingChild) {
      throw new Error('Only one child profile is allowed');
    }
  }

  const profile: Profile = {
    id: Crypto.randomUUID(),
    name,
    type,
    createdAt: new Date().toISOString(),
  };
  await db.insertProfile({
    id: profile.id,
    name: profile.name,
    type: profile.type,
    createdAt: profile.createdAt,
  });
  return profile;
}

export async function renameProfile(id: string, name: string): Promise<void> {
  await db.updateProfile(id, name);
}

export async function removeProfile(id: string): Promise<void> {
  await db.removeProfile(id);
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  coinReward: number;
  color: string;
  createdAt: string;
  // Recurrence fields
  frequency: 'daily' | 'weekly' | 'monthly' | 'once';  // 'once' for existing non-repeating habits
  scheduledTime?: string;  // Format: "HH:mm" (e.g., "09:00")
  daysOfWeek?: number[];  // For weekly: [0,1,2,3,4,5,6] where 0=Sunday
  dayOfMonth?: number;    // For monthly: 1-31
  // Pause fields
  isPaused?: boolean;
  pauseUntil?: string;   // ISO date string
  // Notification fields
  notificationsEnabled?: boolean;
  notificationTime?: string;  // Format: "HH:mm" - separate time for notifications
  profileId?: string;
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
}

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
}

export interface UserStats {
  totalCompletions: number;
  longestStreak: number;
  longestSingleHabitStreak: number;
  longestSingleHabitId: string | null;
}

// Trophy/Achievement types
export type TrophyType = 'streak' | 'completions' | 'single_habit_streak';

export interface Trophy {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: TrophyType;
  requirement: number;  // The count needed to unlock
  emoji: string;  // Display emoji
}

// Predefined trophies/achievements
export const TROPHIES: Trophy[] = [
  {
    id: 'first_step',
    title: 'First Step',
    description: 'Complete your first habit',
    icon: 'star',
    type: 'completions',
    requirement: 1,
    emoji: '🌟',
  },
  {
    id: 'getting_started',
    title: 'Getting Started',
    description: 'Achieve a 3-day streak',
    icon: 'zap',
    type: 'streak',
    requirement: 3,
    emoji: '🔥',
  },
  {
    id: 'week_warrior',
    title: 'Week Warrior',
    description: 'Achieve a 7-day streak',
    icon: 'award',
    type: 'streak',
    requirement: 7,
    emoji: '🏅',
  },
  {
    id: 'two_week_champion',
    title: 'Two Week Champion',
    description: 'Achieve a 14-day streak',
    icon: 'trophy',
    type: 'streak',
    requirement: 14,
    emoji: '🎖️',
  },
  {
    id: 'monthly_master',
    title: '30 day master',
    description: 'Achieve a 30-day streak',
    icon: 'crown',
    type: 'streak',
    requirement: 30,
    emoji: '👑',
  },
  {
    id: 'habit_hero',
    title: 'Habit Hero',
    description: 'Complete 100 habits total',
    icon: 'shield',
    type: 'completions',
    requirement: 100,
    emoji: '🦸',
  },
  {
    id: 'habit_legend',
    title: 'Habit Legend',
    description: 'Complete 365 habits total',
    icon: 'sun',
    type: 'completions',
    requirement: 365,
    emoji: '🌟',
  },
  {
    id: 'consistency_king',
    title: 'Consistency King',
    description: 'Achieve a 30-day streak on a single habit',
    icon: 'heart',
    type: 'single_habit_streak',
    requirement: 30,
    emoji: '💎',
  },
];

// Helper to convert database row to Habit
function rowToHabit(row: db.HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    coinReward: row.coinReward,
    color: row.color,
    createdAt: row.createdAt,
    frequency: row.frequency as Habit['frequency'],
    scheduledTime: row.scheduledTime || undefined,
    daysOfWeek: row.daysOfWeek ? (() => {
      try { return JSON.parse(row.daysOfWeek); }
      catch { return undefined; }
    })() : undefined,
    dayOfMonth: row.dayOfMonth || undefined,
    notificationsEnabled: row.notificationsEnabled === 1,
    notificationTime: row.notificationTime || undefined,
    isPaused: row.isPaused === 1,
    pauseUntil: row.pauseUntil || undefined,
    profileId: row.profileId || undefined,
  };
}

// Helper to convert database row to Reward
function rowToReward(row: db.RewardRow): Reward {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    cost: row.cost,
    color: row.color,
    createdAt: row.createdAt,
    profileId: row.profileId || undefined,
  };
}

// Helper to convert database row to HabitCompletion
function rowToCompletion(row: db.CompletionRow): HabitCompletion {
  return {
    id: row.id,
    habitId: row.habitId,
    habitName: row.habitName,
    coinReward: row.coinReward,
    completedAt: row.completedAt,
  };
}

// Helper to convert database row to RewardRedemption
function rowToRedemption(row: db.RedemptionRow): RewardRedemption {
  return {
    id: row.id,
    rewardId: row.rewardId,
    rewardName: row.rewardName,
    cost: row.cost,
    redeemedAt: row.redeemedAt,
  };
}

export async function getHabits(): Promise<Habit[]> {
  try {
    const rows = await db.getAllHabits(await getActiveProfileId());
    return rows.map(rowToHabit);
  } catch (error) {
    console.error('[ERROR] getHabits failed:', error);
    return [];
  }
}
}
}

export async function saveHabit(habit: Partial<Pick<Habit, 'frequency' | 'scheduledTime' | 'daysOfWeek' | 'dayOfMonth' | 'notificationsEnabled' | 'notificationTime'>> & Omit<Habit, 'id' | 'createdAt' | 'frequency' | 'scheduledTime' | 'daysOfWeek' | 'dayOfMonth' | 'notificationsEnabled' | 'notificationTime'>): Promise<Habit> {
  // Validate input data
  const validatedHabit = validateHabitInput({
    ...habit,
    // Set defaults for validation
    frequency: habit.frequency || 'once',
    scheduledTime: habit.scheduledTime || undefined,
    daysOfWeek: habit.daysOfWeek || undefined,
    dayOfMonth: habit.dayOfMonth || undefined,
    notificationsEnabled: habit.notificationsEnabled !== undefined ? habit.notificationsEnabled : false,
    notificationTime: habit.notificationTime || undefined,
  });
  
  const newHabit: Habit = {
    ...validatedHabit,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  
  try {
    await db.insertHabit({
      id: newHabit.id,
      name: newHabit.name,
      icon: newHabit.icon,
      coinReward: newHabit.coinReward,
      color: newHabit.color,
      createdAt: newHabit.createdAt,
      frequency: newHabit.frequency,
      scheduledTime: newHabit.scheduledTime,
      daysOfWeek: newHabit.daysOfWeek ? JSON.stringify(newHabit.daysOfWeek) : undefined,
      dayOfMonth: newHabit.dayOfMonth,
      notificationsEnabled: newHabit.notificationsEnabled ? 1 : 0,
      notificationTime: newHabit.notificationTime,
      profileId: newHabit.profileId || await getActiveProfileId(),
    });
  } catch (error) {
    console.error('[ERROR] insertHabit failed:', error);
    throw error; // Re-throw so UI knows about the failure
  }
  
  return newHabit;
}

export async function deleteHabit(id: string): Promise<void> {
  // Validate id
  if (!id || typeof id !== 'string') {
    console.error('[ERROR] deleteHabit called with invalid id:', id);
    return;
  }
  await db.removeHabit(id);
}

// Update an existing habit
export async function updateHabit(habit: Partial<Pick<Habit, 'name' | 'icon' | 'coinReward' | 'color' | 'frequency' | 'scheduledTime' | 'daysOfWeek' | 'dayOfMonth' | 'notificationsEnabled' | 'notificationTime' | 'profileId'>> & { id: string }): Promise<void> {
  const updateData: any = { id: habit.id };
  
  if (habit.name !== undefined) updateData.name = habit.name;
  if (habit.icon !== undefined) updateData.icon = habit.icon;
  if (habit.coinReward !== undefined) updateData.coinReward = habit.coinReward;
  if (habit.color !== undefined) updateData.color = habit.color;
  if (habit.frequency !== undefined) updateData.frequency = habit.frequency;
  if (habit.scheduledTime !== undefined) updateData.scheduledTime = habit.scheduledTime;
  if (habit.daysOfWeek !== undefined) updateData.daysOfWeek = habit.daysOfWeek ? JSON.stringify(habit.daysOfWeek) : undefined;
  if (habit.dayOfMonth !== undefined) updateData.dayOfMonth = habit.dayOfMonth;
  if (habit.notificationsEnabled !== undefined) updateData.notificationsEnabled = habit.notificationsEnabled ? 1 : 0;
  if (habit.notificationTime !== undefined) updateData.notificationTime = habit.notificationTime;
  if (habit.profileId !== undefined) updateData.profileId = habit.profileId;
  
  await db.updateHabit(updateData);
}

// Check if a habit is currently paused (has pauseUntil date in the future)
export function isHabitPaused(habit: Habit): boolean {
  if (!habit.isPaused || !habit.pauseUntil) return false;
  const pauseUntilDate = new Date(habit.pauseUntil);
  return pauseUntilDate > new Date();
}

// Pause a habit for a specified number of days
export async function pauseHabit(habitId: string, days: number): Promise<void> {
  // Validate inputs
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] pauseHabit called with invalid habitId:', habitId);
    return;
  }
  if (!days || typeof days !== 'number' || days < 1 || days > 365) {
    console.error('[ERROR] pauseHabit called with invalid days:', days);
    return;
  }

  const pauseUntilDate = new Date();
  pauseUntilDate.setDate(pauseUntilDate.getDate() + days);
  
  await db.updateHabit({
    id: habitId,
    isPaused: 1,
    pauseUntil: pauseUntilDate.toISOString(),
  });
}

// Resume a paused habit
export async function resumeHabit(habitId: string): Promise<void> {
  // Validate habitId
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] resumeHabit called with invalid habitId:', habitId);
    return;
  }

  await db.updateHabit({
    id: habitId,
    isPaused: 0,
    pauseUntil: undefined,
  });
}

// Update habit notification settings
export async function updateHabitNotifications(
  habitId: string,
  notificationsEnabled: boolean,
  notificationTime?: string
): Promise<void> {
  await db.updateHabit({
    id: habitId,
    notificationsEnabled: notificationsEnabled ? 1 : 0,
    notificationTime: notificationTime || undefined,
  });
}

export async function getCompletions(profileId?: string): Promise<HabitCompletion[]> {
  try {
    const resolvedProfileId = profileId !== undefined ? profileId : await getActiveProfileId();
    const rows = await db.getAllCompletions(resolvedProfileId);
    return rows.map(rowToCompletion);
  } catch (error) {
    console.error('[ERROR] getCompletions failed:', error);
    return [];
  }
}

export async function getAllProfileCompletions(): Promise<(HabitCompletion & { profileId?: string })[]> {
  try {
    const rows = await db.getAllCompletions();
    return rows.map(r => ({ ...rowToCompletion(r), profileId: r.profileId || undefined }));
  } catch (error) {
    console.error('[ERROR] getAllProfileCompletions failed:', error);
    return [];
  }
}

export async function getTodayCompletions(): Promise<HabitCompletion[]> {
  const completions = await getCompletions();
  const today = new Date().toDateString();
  return completions.filter(
    (c) => new Date(c.completedAt).toDateString() === today
  );
}

export async function completeHabit(habit: Habit): Promise<HabitCompletion> {
  // Validate habit object using our validation schema
  try {
    validateHabitInput(habit);
  } catch (error) {
    console.error('[ERROR] completeHabit called with invalid habit:', habit, error);
    throw new Error(`Invalid habit object: ${error.message}`);
  }

  const completion: HabitCompletion = {
    id: Crypto.randomUUID(),
    habitId: habit.id,
    habitName: habit.name,
    coinReward: habit.coinReward,
    completedAt: new Date().toISOString(),
  };
  
   const targetProfileId = habit.profileId || await getActiveProfileId();
  
  try {
    await db.insertCompletion({
      id: completion.id,
      habitId: completion.habitId,
      habitName: completion.habitName,
      coinReward: completion.coinReward,
      completedAt: completion.completedAt,
      profileId: targetProfileId,
    });

    const balance = await getBalance(targetProfileId);
    await setBalance(balance + habit.coinReward, targetProfileId);
    
    // Increment total completions in stats
    await db.updateUserStats({
      totalCompletions: 1, // Increment by 1
    }, targetProfileId);
  } catch (error) {
    console.error('[ERROR] completeHabit failed:', error);
    throw error;
  }

  return completion;
}

// Uncomplete a habit (remove completion and refund coins)
export async function uncompleteHabit(habitId: string, profileId?: string): Promise<void> {
  // Validate habitId
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] uncompleteHabit called with invalid habitId:', habitId);
    return;
  }
  
  const targetProfileId = profileId || await getActiveProfileId();
  const completions = await getCompletions(targetProfileId);
  const today = new Date().toDateString();
  
  // Find today's completion for this habit
  const todayCompletion = completions.find(
    (c) => c.habitId === habitId && new Date(c.completedAt).toDateString() === today
  );
  
  if (todayCompletion) {
    try {
      // Remove the completion
      await db.removeCompletion(todayCompletion.id);
      
      // Refund the coins
      const balance = await getBalance(targetProfileId);
      await setBalance(Math.max(0, balance - todayCompletion.coinReward), targetProfileId);
      
      // Decrement total completions in stats (with bounds checking)
      const stats = await getUserStats(targetProfileId);
      if (stats.totalCompletions > 0) {
        await db.updateUserStats({
          totalCompletions: -1, // Decrement by 1
        }, targetProfileId);
      }
    } catch (error) {
      console.error('[ERROR] uncompleteHabit failed:', error);
      throw error;
    }
  }
}

export async function getRewards(): Promise<Reward[]> {
  try {
    const rows = await db.getAllRewards(await getActiveProfileId());
    return rows.map(rowToReward);
  } catch (error) {
    console.error('[ERROR] getRewards failed:', error);
    return [];
  }
}

export async function saveReward(reward: Omit<Reward, "id" | "createdAt">): Promise<Reward> {
  // Validate input data
  const validatedReward = validateRewardInput({
    ...reward,
  });
  
  const newReward: Reward = {
    ...validatedReward,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  
  try {
    await db.insertReward({
      id: newReward.id,
      name: newReward.name,
      icon: newReward.icon,
      cost: newReward.cost,
      color: newReward.color,
      createdAt: newReward.createdAt,
      profileId: newReward.profileId || await getActiveProfileId(),
    });
  } catch (error) {
    console.error('[ERROR] insertReward failed:', error);
    throw error;
  }
  
  return newReward;
}

export async function deleteReward(id: string): Promise<void> {
  await db.removeReward(id);
}

// Update an existing reward
export async function updateReward(reward: Partial<Pick<Reward, 'name' | 'icon' | 'cost' | 'color' | 'profileId'>> & { id: string }): Promise<void> {
  const updateData: any = { id: reward.id };
  
  if (reward.name !== undefined) updateData.name = reward.name;
  if (reward.icon !== undefined) updateData.icon = reward.icon;
  if (reward.cost !== undefined) updateData.cost = reward.cost;
  if (reward.color !== undefined) updateData.color = reward.color;
  if (reward.profileId !== undefined) updateData.profileId = reward.profileId;
  
  await db.updateReward(updateData);
}

export async function getRedemptions(profileId?: string): Promise<RewardRedemption[]> {
  try {
    const resolvedProfileId = profileId !== undefined ? profileId : await getActiveProfileId();
    const rows = await db.getAllRedemptions(resolvedProfileId);
    return rows.map(rowToRedemption);
  } catch (error) {
    console.error('[ERROR] getRedemptions failed:', error);
    return [];
  }
}

export async function getAllProfileRedemptions(): Promise<(RewardRedemption & { profileId?: string })[]> {
  try {
    const rows = await db.getAllRedemptions();
    return rows.map(r => ({ ...rowToRedemption(r), profileId: r.profileId || undefined }));
  } catch (error) {
    console.error('[ERROR] getAllProfileRedemptions failed:', error);
    return [];
  }
}

export async function redeemReward(reward: Reward): Promise<RewardRedemption | null> {
  const targetProfileId = reward.profileId || await getActiveProfileId();
  const balance = await getBalance(targetProfileId);
  if (balance < reward.cost) return null;

  const redemption: RewardRedemption = {
    id: Crypto.randomUUID(),
    rewardId: reward.id,
    rewardName: reward.name,
    cost: reward.cost,
    redeemedAt: new Date().toISOString(),
  };
  
  try {
    await db.insertRedemption({
      id: redemption.id,
      rewardId: redemption.rewardId,
      rewardName: redemption.rewardName,
      cost: redemption.cost,
      redeemedAt: redemption.redeemedAt,
      profileId: targetProfileId,
    });
    
    await setBalance(balance - reward.cost, targetProfileId);
  } catch (error) {
    console.error('[ERROR] redeemReward failed:', error);
    throw error;
  }

  return redemption;
}

export async function getBalance(profileId?: string): Promise<number> {
  try {
    return await db.getWalletBalance(profileId || await getActiveProfileId());
  } catch (error) {
    console.error('[ERROR] getBalance failed:', error);
    return 0;
  }
}

export async function setBalance(balance: number, profileId?: string): Promise<void> {
  try {
    await db.setWalletBalance(balance, profileId || await getActiveProfileId());
  } catch (error) {
    console.error('[ERROR] setBalance failed:', error);
  }
}

export async function getStreak(habitId: string, profileId?: string): Promise<number> {
  // Validate habitId
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] getStreak called with invalid habitId:', habitId);
    return 0;
  }
  
  try {
    const resolvedProfileId = profileId || await getActiveProfileId();
    const completions = await getCompletions(resolvedProfileId);
    const habitCompletions = completions
      .filter((c) => c.habitId === habitId)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    if (habitCompletions.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toDateString();

      const found = habitCompletions.some(
        (c) => new Date(c.completedAt).toDateString() === dateStr
      );

      if (found) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  } catch (error) {
    console.error('[ERROR] getStreak failed:', error);
    return 0;
  }
}

// Helper function to check if a habit is due today based on its frequency
export function isHabitDueToday(habit: Habit): boolean {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayOfMonth = today.getDate(); // 1-31

  // Default to 'once' for backward compatibility
  const frequency = habit.frequency || 'once';

  switch (frequency) {
    case 'daily':
      // Daily habits are always due today
      return true;

    case 'weekly':
      // Weekly habits are due on specified days of the week
      if (habit.daysOfWeek && habit.daysOfWeek.length > 0) {
        return habit.daysOfWeek.includes(dayOfWeek);
      }
      // If no specific days are set, default to all days
      return true;

    case 'monthly':
      // Monthly habits are due on a specific day of the month
      if (habit.dayOfMonth) {
        return dayOfMonth === habit.dayOfMonth;
      }
      // If no day is set, default to today
      return true;

    case 'once':
    default:
      // For non-repeating habits, check if they were created today
      const createdDate = new Date(habit.createdAt);
      return (
        createdDate.getFullYear() === today.getFullYear() &&
        createdDate.getMonth() === today.getMonth() &&
        createdDate.getDate() === today.getDate()
      );
  }
}

// Helper function to calculate the next due date for a habit
export function getNextOccurrence(habit: Habit): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const frequency = habit.frequency || 'once';

  switch (frequency) {
    case 'daily':
      // Next daily occurrence is tomorrow
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;

    case 'weekly': {
      // Find the next scheduled day of the week
      const daysOfWeek = habit.daysOfWeek && habit.daysOfWeek.length > 0 
        ? habit.daysOfWeek 
        : [today.getDay()]; // Default to today if no days specified
      
      const currentDay = today.getDay();
      let nextDay = daysOfWeek.find(d => d > currentDay);
      
      if (nextDay !== undefined) {
        const nextDate = new Date(today);
        nextDate.setDate(nextDate.getDate() + (nextDay - currentDay));
        return nextDate;
      } else {
        // All remaining days are in the past, wrap to first day
        const daysUntilNext = 7 - currentDay + daysOfWeek[0];
        const nextDate = new Date(today);
        nextDate.setDate(nextDate.getDate() + daysUntilNext);
        return nextDate;
      }
    }

    case 'monthly': {
      // Find the next scheduled day of the month
      const targetDay = habit.dayOfMonth || today.getDate();
      const currentDay = today.getDate();
      
      if (targetDay > currentDay) {
        const nextDate = new Date(today);
        nextDate.setDate(targetDay);
        return nextDate;
      } else {
        // Target day has passed this month, go to next month
        const nextDate = new Date(today);
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextDate.setDate(Math.min(targetDay, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()));
        return nextDate;
      }
    }

    case 'once':
    default:
      // For non-repeating habits, return the creation date
      return new Date(habit.createdAt);
  }
}

// ==================== ACHIEVEMENT SYSTEM ====================

export interface UnlockedAchievement {
  id: string;
  trophyId: string;
  unlockedAt: string;
}

// Get all unlocked achievements
export async function getUnlockedAchievements(): Promise<UnlockedAchievement[]> {
  try {
    const rows = await db.getUnlockedAchievements(await getActiveProfileId());
    return rows.map((row) => ({
      id: row.id,
      trophyId: row.trophyId,
      unlockedAt: row.unlockedAt,
    }));
  } catch (error) {
    console.error('[ERROR] getUnlockedAchievements failed:', error);
    return [];
  }
}

// Get user stats
export async function getUserStats(profileId?: string): Promise<UserStats> {
  try {
    const targetProfileId = profileId || await getActiveProfileId();
    const stats = await db.getUserStats(targetProfileId);
    return {
      totalCompletions: stats.totalCompletions,
      longestStreak: stats.longestStreak,
      longestSingleHabitStreak: stats.longestSingleHabitStreak,
      longestSingleHabitId: stats.longestSingleHabitId,
    };
  } catch (error) {
    console.error('[ERROR] getUserStats failed:', error);
    return { totalCompletions: 0, longestStreak: 0, longestSingleHabitStreak: 0, longestSingleHabitId: null };
  }
}

// Get all trophies with their unlock status
export async function getTrophiesWithStatus(): Promise<{
  trophy: Trophy;
  unlocked: boolean;
  unlockedAt?: string;
  progress: number;
}[]> {
  try {
    const unlocked = await getUnlockedAchievements();
    const stats = await getUserStats();
    const unlockedIds = new Set(unlocked.map((u) => u.trophyId));

    return TROPHIES.map((trophy) => {
      const unlockedAchievement = unlocked.find((u) => u.trophyId === trophy.id);
      let progress = 0;

      switch (trophy.type) {
        case 'completions':
          progress = stats.totalCompletions;
          break;
        case 'streak':
          progress = stats.longestStreak;
          break;
        case 'single_habit_streak':
          progress = stats.longestSingleHabitStreak;
          break;
      }

      return {
        trophy,
        unlocked: unlockedIds.has(trophy.id),
        unlockedAt: unlockedAchievement?.unlockedAt,
        progress: Math.min(progress, trophy.requirement),
      };
    });
  } catch (error) {
    console.error('[ERROR] getTrophiesWithStatus failed:', error);
    return TROPHIES.map(trophy => ({
      trophy,
      unlocked: false,
      progress: 0,
    }));
  }
}

// Check and unlock achievements after a habit is completed
export async function checkAndUnlockAchievements(
  habit: Habit,
  currentStreak: number
): Promise<Trophy[]> {
  const profileId = await getActiveProfileId();
  const unlockedAchievements = await getUnlockedAchievements();
  const unlockedIds = new Set(unlockedAchievements.map((u) => u.trophyId));
  const stats = await getUserStats();
  const newUnlocked: Trophy[] = [];

  // Update user stats
  await db.updateUserStats({
    totalCompletions: 1,
  }, profileId);

  // Update longest streak if current streak is longer
  if (currentStreak > stats.longestStreak) {
    await db.updateUserStats({
      longestStreak: currentStreak,
    }, profileId);
  }

  // Update single habit streak if current streak for this habit is longer
  if (currentStreak > stats.longestSingleHabitStreak) {
    await db.updateUserStats({
      longestSingleHabitStreak: currentStreak,
      longestSingleHabitId: habit.id,
    }, profileId);
  }

  // Get updated stats
  const updatedStats = await getUserStats();

  // Check each trophy
  for (const trophy of TROPHIES) {
    if (unlockedIds.has(trophy.id)) continue; // Already unlocked

    let shouldUnlock = false;

    switch (trophy.type) {
      case 'completions':
        shouldUnlock = updatedStats.totalCompletions >= trophy.requirement;
        break;
      case 'streak':
        shouldUnlock = updatedStats.longestStreak >= trophy.requirement;
        break;
      case 'single_habit_streak':
        shouldUnlock = updatedStats.longestSingleHabitStreak >= trophy.requirement;
        break;
    }

    if (shouldUnlock) {
      await db.insertAchievement({
        id: Crypto.randomUUID(),
        trophyId: trophy.id,
        unlockedAt: new Date().toISOString(),
        profileId,
      });
      newUnlocked.push(trophy);
    }
  }

  return newUnlocked;
}

// Get achievement progress for UI
export function getAchievementProgress(trophy: Trophy, stats: UserStats): number {
  switch (trophy.type) {
    case 'completions':
      return Math.min(stats.totalCompletions / trophy.requirement, 1);
    case 'streak':
      return Math.min(stats.longestStreak / trophy.requirement, 1);
    case 'single_habit_streak':
      return Math.min(stats.longestSingleHabitStreak / trophy.requirement, 1);
    default:
      return 0;
  }
}

// Get next achievement to unlock
export function getNextAchievement(trophies: { trophy: Trophy; unlocked: boolean }[]): Trophy | null {
  const locked = trophies.filter((t) => !t.unlocked);
  if (locked.length === 0) return null;
  
  // Sort by requirement
  return locked.sort((a, b) => a.trophy.requirement - b.trophy.requirement)[0].trophy;
}

// Calculate overall consistency score (percentage based on cumulative completion rate)
// Each habit's score is: (days since first scheduled) / (days since first scheduled - current streak days)
// Example: Day 1 done = 100%, Day 2 missed = 50%, Day 3 missed = 33.33%
export async function getConsistencyScore(profileId?: string): Promise<number> {
  try {
    const targetProfileId = profileId || await getActiveProfileId();
    const rows = await db.getAllHabits(targetProfileId);
    const habits = rows.map(rowToHabit);
    
    const completionRows = await db.getAllCompletions(targetProfileId);
    const completions = completionRows.map(rowToCompletion);
  
  if (habits.length === 0) return 0;
  
  // Filter out paused habits
  const activeHabits = habits.filter(h => !isHabitPaused(h));
  if (activeHabits.length === 0) return 0;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  let totalScore = 0;
  let habitCount = 0;
  
  for (const habit of activeHabits) {
    // Get all completions for this habit
    const habitCompletions = completions.filter(c => c.habitId === habit.id);
    
    if (habitCompletions.length === 0) {
      // No completions yet, check if habit was just created
      const createdDate = new Date(habit.createdAt);
      createdDate.setHours(0, 0, 0, 0);
      const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceCreation === 0) {
        // Created today, give full score since nothing was due yet
        totalScore += 100;
      } else {
        // Hasn't been completed since creation
        totalScore += 0;
      }
      habitCount++;
      continue;
    }
    
    // Get unique dates when habit was completed
    const completionDates = new Set(
      habitCompletions.map(c => new Date(c.completedAt).toDateString())
    );
    
    // Calculate days since habit was created
    const createdDate = new Date(habit.createdAt);
    createdDate.setHours(0, 0, 0, 0);
    const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include today
    
    // Calculate how many days the habit was due (based on frequency)
    let daysDue = 0;
    const frequency = habit.frequency || 'once';
    
    if (frequency === 'daily') {
      daysDue = daysSinceCreation;
    } else if (frequency === 'weekly') {
      // Count weeks since creation
      daysDue = Math.ceil(daysSinceCreation / 7);
    } else if (frequency === 'monthly') {
      daysDue = 1; // Monthly habits are due once per month
    } else {
      // 'once' - only due on creation day
      daysDue = 1;
    }
    
    // Count completed days
    let completedDays = 0;
    
    if (frequency === 'daily') {
      // For daily habits, count each day from creation to now
      for (let i = 0; i < daysSinceCreation; i++) {
        const checkDate = new Date(createdDate);
        checkDate.setDate(checkDate.getDate() + i);
        if (completionDates.has(checkDate.toDateString())) {
          completedDays++;
        }
      }
    } else if (frequency === 'weekly') {
      // For weekly habits, check each week
      const weeksSinceCreation = Math.ceil(daysSinceCreation / 7);
      for (let week = 0; week < weeksSinceCreation; week++) {
        const weekStartDate = new Date(createdDate);
        weekStartDate.setDate(weekStartDate.getDate() + (week * 7));
        // Check if any day in this week was completed
        let weekCompleted = false;
        for (let day = 0; day < 7; day++) {
          const checkDate = new Date(weekStartDate);
          checkDate.setDate(checkDate.getDate() + day);
          if (completionDates.has(checkDate.toDateString())) {
            weekCompleted = true;
            break;
          }
        }
        if (weekCompleted) completedDays++;
      }
    } else {
      // For monthly/once, just check if completed at all
      completedDays = completionDates.size > 0 ? 1 : 0;
    }
    
    // Calculate score: if completed on first day = 100%, each miss reduces the max possible
    // Formula: (completed days) / (total days due) * 100
    if (daysDue > 0) {
      const habitScore = Math.round((completedDays / daysDue) * 100);
      totalScore += habitScore;
    } else {
      totalScore += 100; // No days due yet
    }
    habitCount++;
  }
  
  if (habitCount === 0) return 0;
  
  return Math.round(totalScore / habitCount);
  } catch (error) {
    console.error('[ERROR] getConsistencyScore failed:', error);
    return 0;
  }
}

// Calculate individual habit consistency score
// Score is based on cumulative completion: day 1 done = 100%, day 2 missed = 50%, etc.
export async function getHabitConsistencyScore(habitId: string): Promise<number> {
  const habits = await getHabits();
  const completions = await getCompletions();
  
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return 0;
  
  // Check if paused
  if (isHabitPaused(habit)) return 0;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Get all completions for this habit
  const habitCompletions = completions.filter(c => c.habitId === habitId);
  
  if (habitCompletions.length === 0) {
    // No completions yet
    const createdDate = new Date(habit.createdAt);
    createdDate.setHours(0, 0, 0, 0);
    const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceCreation === 0) {
      return 100; // Created today
    }
    return 0; // Hasn't been completed
  }
  
  // Get unique dates when habit was completed
  const completionDates = new Set(
    habitCompletions.map(c => new Date(c.completedAt).toDateString())
  );
  
  // Calculate days since habit was created
  const createdDate = new Date(habit.createdAt);
  createdDate.setHours(0, 0, 0, 0);
  const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  // Calculate how many days the habit was due
  let daysDue = 0;
  const frequency = habit.frequency || 'once';
  
  if (frequency === 'daily') {
    daysDue = daysSinceCreation;
  } else if (frequency === 'weekly') {
    daysDue = Math.ceil(daysSinceCreation / 7);
  } else if (frequency === 'monthly') {
    daysDue = 1;
  } else {
    daysDue = 1;
  }
  
  // Count completed days
  let completedDays = 0;
  
  if (frequency === 'daily') {
    for (let i = 0; i < daysSinceCreation; i++) {
      const checkDate = new Date(createdDate);
      checkDate.setDate(checkDate.getDate() + i);
      if (completionDates.has(checkDate.toDateString())) {
        completedDays++;
      }
    }
  } else if (frequency === 'weekly') {
    const weeksSinceCreation = Math.ceil(daysSinceCreation / 7);
    for (let week = 0; week < weeksSinceCreation; week++) {
      const weekStartDate = new Date(createdDate);
      weekStartDate.setDate(weekStartDate.getDate() + (week * 7));
      let weekCompleted = false;
      for (let day = 0; day < 7; day++) {
        const checkDate = new Date(weekStartDate);
        checkDate.setDate(checkDate.getDate() + day);
        if (completionDates.has(checkDate.toDateString())) {
          weekCompleted = true;
          break;
        }
      }
      if (weekCompleted) completedDays++;
    }
  } else {
    completedDays = completionDates.size > 0 ? 1 : 0;
  }
  
  if (daysDue === 0) return 100;
  
  return Math.round((completedDays / daysDue) * 100);
}

// ==================== PURCHASED SKILLS ====================

export async function getPurchasedSkillIds(): Promise<string[]> {
  try {
    const rows = await db.getPurchasedSkills(await getActiveProfileId());
    return rows.map(r => r.skillId);
  } catch (error) {
    console.error('[ERROR] getPurchasedSkillIds failed:', error);
    return [];
  }
}

export async function savePurchasedSkill(skillId: string): Promise<void> {
  try {
    await db.insertPurchasedSkill({
      id: Crypto.randomUUID(),
      skillId,
      profileId: await getActiveProfileId(),
      purchasedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ERROR] savePurchasedSkill failed:', error);
    throw error;
  }
}

// Restore a broken streak by spending coins
export async function restoreStreakWithCoins(cost: number): Promise<boolean> {
  const profileId = getActiveProfileId();
  const balance = await getBalance();
  if (balance < cost) return false;
  
  await setBalance(balance - cost);
  
  // Update longest streak in user stats
  const stats = await db.getUserStats(profileId);
  await db.updateUserStats({
    longestStreak: stats.longestStreak + 1,
  }, profileId);
  
  return true;
}

// Add bonus points to a profile
export async function addBonusPoints(amount: number, profileId?: string): Promise<void> {
  const targetProfile = profileId || getActiveProfileId();
  const balance = await db.getWalletBalance(targetProfile);
  await db.setWalletBalance(balance + amount, targetProfile);
}

// Apply penalty points to a profile
export async function applyPenaltyPoints(amount: number, profileId?: string): Promise<void> {
  const targetProfile = profileId || getActiveProfileId();
  const balance = await db.getWalletBalance(targetProfile);
  await db.setWalletBalance(Math.max(0, balance - amount), targetProfile);
}

// Reset streak for a profile
export async function resetStreak(profileId?: string): Promise<void> {
  const targetProfile = profileId || getActiveProfileId();
  await db.updateUserStats({
    longestStreak: 0,
    longestSingleHabitStreak: 0,
    longestSingleHabitId: undefined,
  }, targetProfile);
}
