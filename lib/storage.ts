import * as Crypto from "expo-crypto";
import * as db from "./db";
import { withTransaction, getDatabase } from "./db";
import { validateHabitInput, validateRewardInput, validateCompletionInput, validateRedemptionInput, validateProfileInput } from "./validation";
import { isEnabled, FEATURE_FLAGS } from "./feature-flags";

// Check if we're running on web without database
const isWeb = typeof window !== 'undefined';
let useMemoryStore = false;
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

const SESSION_KEY = 'habit_kingdom_storage';

// In-memory store for web fallback
const memoryStore = {
  profiles: [] as Profile[],
  habits: [] as Habit[],
  completions: [] as HabitCompletion[],
  rewards: [] as Reward[],
  redemptions: [] as RewardRedemption[],
  unlockedAchievements: [] as UnlockedAchievement[],
  userStats: { totalCompletions: 0, longestStreak: 0, longestSingleHabitStreak: 0, longestSingleHabitId: '', profileId: 'default' } as UserStats,
  walletBalance: 0,
  purchasedSkills: [] as string[],
  activeProfileId: 'default',
};

function saveMemoryStore(): void {
  if (!isWeb) return;
  try {
    const data = {
      profiles: memoryStore.profiles,
      habits: memoryStore.habits,
      completions: memoryStore.completions,
      rewards: memoryStore.rewards,
      redemptions: memoryStore.redemptions,
      unlockedAchievements: memoryStore.unlockedAchievements,
      userStats: memoryStore.userStats,
      walletBalance: memoryStore.walletBalance,
      purchasedSkills: memoryStore.purchasedSkills,
      activeProfileId: memoryStore.activeProfileId,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[STORAGE] Failed to save to sessionStorage:', error);
  }
}

function loadMemoryStore(): boolean {
  if (!isWeb) return false;
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      memoryStore.profiles = data.profiles || [];
      memoryStore.habits = data.habits || [];
      memoryStore.completions = data.completions || [];
      memoryStore.rewards = data.rewards || [];
      memoryStore.redemptions = data.redemptions || [];
      memoryStore.unlockedAchievements = data.unlockedAchievements || [];
      memoryStore.userStats = data.userStats || memoryStore.userStats;
      memoryStore.walletBalance = data.walletBalance || 0;
      memoryStore.purchasedSkills = data.purchasedSkills || [];
      memoryStore.activeProfileId = data.activeProfileId || 'default';
      activeProfileId = memoryStore.activeProfileId;
      console.log('[STORAGE] Loaded from sessionStorage');
      return true;
    }
  } catch (error) {
    console.warn('[STORAGE] Failed to load from sessionStorage:', error);
  }
  return false;
}

// Initialize database on module load
async function ensureDbReady(): Promise<void> {
  if (dbInitialized) return;
  
  // Prevent multiple initialization attempts
  if (dbInitPromise) {
    return dbInitPromise;
  }
  
  console.log('[STORAGE] Initializing...');
  
  dbInitPromise = (async () => {
    // On web, always use memory store and load from sessionStorage first
    if (isWeb) {
      useMemoryStore = true;
      loadMemoryStore();
      console.log('[STORAGE] Web detected: using sessionStorage-persisted memory store');
    } else {
      try {
        console.log('[STORAGE] Attempting to open database...');
        await getDatabase();
        useMemoryStore = false;
        console.log('[STORAGE] SUCCESS: Using SQLite database');
      } catch (error: any) {
        console.warn('[STORAGE] Database failed, falling back to in-memory store');
        useMemoryStore = true;
        loadMemoryStore();
      }
    }
    dbInitialized = true;
    console.log('[STORAGE] Initialization complete. useMemoryStore =', useMemoryStore);
  })();
  
  return dbInitPromise;
}

// Initialize on first access
ensureDbReady();

// ==================== PROFILE MANAGEMENT ====================

export interface Profile {
  id: string;
  name: string;
  type: 'child' | 'parent';
  createdAt: string;
}

let activeProfileId: string | null = null;
let profilesCache: Profile[] = [];

export async function initializeProfiles(): Promise<void> {
  const profiles = await getProfiles();
  if (profiles.length === 0) {
    await createProfile('Default', 'child');
  }
  // Sync with persisted active profile
  await syncActiveProfile();
}

async function syncActiveProfile(): Promise<void> {
  try {
    const { getActiveProfileId: getSavedActiveProfileId } = await import('./onboarding-storage');
    const savedId = await getSavedActiveProfileId();
    if (savedId) {
      activeProfileId = savedId;
    } else {
      const profiles = await getProfiles();
      if (profiles.length > 0) {
        activeProfileId = profiles[0].id;
      }
    }
  } catch (error) {
    console.error('[Storage] Failed to sync active profile:', error);
    const profiles = await getProfiles();
    if (profiles.length > 0) {
      activeProfileId = profiles[0].id;
    }
  }
}

export function setActiveProfileId(id: string): void {
  if (!id?.trim()) {
    console.warn('[WARN] setActiveProfileId called with empty id');
    return;
  }
  activeProfileId = id;
  memoryStore.activeProfileId = id;
  profilesCache = profilesCache.map(p => 
    p.id === id ? { ...p, id } : p
  );
  if (useMemoryStore) {
    saveMemoryStore();
  }
}

export function getActiveProfileId(): string {
  return activeProfileId || 'default';
}

export async function switchProfile(newProfileId: string): Promise<void> {
  if (!newProfileId?.trim()) {
    throw new Error('Invalid profile ID');
  }
  const oldProfileId = activeProfileId;
  
  setActiveProfileId(newProfileId);
  
  try {
    const { setActiveProfileId: saveToStorage } = await import('./onboarding-storage');
    await saveToStorage(newProfileId);
  } catch (error) {
    activeProfileId = oldProfileId;
    console.error('[ERROR] Failed to persist profile switch:', error);
    throw error instanceof Error ? error : new Error('Failed to switch profile');
  }
}

export function clearProfileState(): void {
  activeProfileId = null;
  profilesCache = [];
}

export function getAllActiveProfileIds(): string[] {
  return activeProfileId ? [activeProfileId] : ['default'];
}

export function isParentProfile(): boolean {
  const profile = profilesCache.find(p => p.id === activeProfileId);
  return profile?.type === 'parent';
}

export function isChildProfile(): boolean {
  const profile = profilesCache.find(p => p.id === activeProfileId);
  return profile?.type === 'child';
}

export async function getActiveProfileIdAsync(): Promise<string> {
  await ensureDbReady();
  return activeProfileId || 'default';
}

export async function getActiveProfile(): Promise<Profile | null> {
  const profiles = await getProfiles();
  return profiles.find(p => p.id === activeProfileId) || null;
}

export async function checkIsParent(): Promise<boolean> {
  const profile = await getActiveProfile();
  return profile?.type === 'parent';
}

export async function checkIsChild(): Promise<boolean> {
  const profile = await getActiveProfile();
  return profile?.type === 'child';
}

export async function getProfiles(): Promise<Profile[]> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    profilesCache = memoryStore.profiles;
    return memoryStore.profiles;
  }
  
  try {
    const rows = await db.getAllProfiles();
    profilesCache = rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type as 'child' | 'parent',
      createdAt: r.createdAt,
    }));
    return profilesCache;
  } catch (error) {
    console.error('[ERROR] getProfiles failed:', error);
    return [];
  }
}

export async function createProfile(name: string, type: 'child' | 'parent'): Promise<Profile> {
  await ensureDbReady();
  
  try {
    if (!name?.trim()) {
      throw new Error('Profile name is required');
    }
    if (name.trim().length > 50) {
      throw new Error('Profile name must be 50 characters or less');
    }

    const allProfiles = useMemoryStore ? memoryStore.profiles : await db.getAllProfiles();
    
    // Check child limit
    const existingChild = allProfiles.find(p => p.type === 'child');
    if (type === 'child' && existingChild) {
      throw new Error('Only one child profile is allowed');
    }

    // Check parent limit (server-side enforcement)
    if (isEnabled('PARENT_ACCESS_CONTROL') && !useMemoryStore) {
      const settings = await db.getProfileSettings();
      const parentCount = allProfiles.filter(p => p.type === 'parent').length;
      if (type === 'parent' && parentCount >= settings.maxParents) {
        throw new Error(`Maximum of ${settings.maxParents} parent profiles allowed`);
      }
    }

    const profile: Profile = {
      id: Crypto.randomUUID(),
      name: name.trim(),
      type,
      createdAt: new Date().toISOString(),
    };
    
    if (useMemoryStore) {
      memoryStore.profiles.push(profile);
      saveMemoryStore();
      console.log('[STORAGE] Created profile in memory:', profile.name);
    } else {
      await db.insertProfile({
        id: profile.id,
        name: profile.name,
        type: profile.type,
        createdAt: profile.createdAt,
      });
    }
    
    return profile;
  } catch (error) {
    console.error('[ERROR] createProfile failed:', error);
    throw error instanceof Error ? error : new Error('Failed to create profile');
  }
}

export async function renameProfile(id: string, name: string): Promise<void> {
  try {
    if (!id?.trim()) {
      throw new Error('Profile ID is required');
    }
    if (!name?.trim()) {
      throw new Error('Profile name is required');
    }
    if (name.trim().length > 50) {
      throw new Error('Profile name must be 50 characters or less');
    }
    await db.updateProfile(id, name);
  } catch (error) {
    console.error('[ERROR] renameProfile failed:', error);
    throw error instanceof Error ? error : new Error('Failed to rename profile');
  }
}

export async function removeProfile(id: string): Promise<void> {
  try {
    if (!id?.trim()) {
      throw new Error('Profile ID is required');
    }
    if (id === 'default') {
      throw new Error('Cannot delete the default profile');
    }
    await db.removeProfile(id);
  } catch (error) {
    console.error('[ERROR] removeProfile failed:', error);
    throw error instanceof Error ? error : new Error('Failed to remove profile');
  }
}

// ==================== HABIT TYPES ====================

export interface Habit {
  id: string;
  name: string;
  icon: string;
  coinReward: number;
  color: string;
  createdAt: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'once';
  scheduledTime?: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  isPaused?: boolean;
  pauseUntil?: string;
  notificationsEnabled?: boolean;
  notificationTime?: string;
  profileId?: string;
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
  profileId?: string;
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
  profileId?: string;
}

export interface UserStats {
  totalCompletions: number;
  longestStreak: number;
  longestSingleHabitStreak: number;
  longestSingleHabitId: string | null;
}

export type TrophyType = 'streak' | 'completions' | 'single_habit_streak';

export interface Trophy {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: TrophyType;
  requirement: number;
  emoji: string;
}

export const TROPHIES: Trophy[] = [
  { id: 'first_step', title: 'First Step', description: 'Complete your first habit', icon: 'star', type: 'completions', requirement: 1, emoji: '🌟' },
  { id: 'getting_started', title: 'Getting Started', description: 'Achieve a 3-day streak', icon: 'zap', type: 'streak', requirement: 3, emoji: '🔥' },
  { id: 'week_warrior', title: 'Week Warrior', description: 'Achieve a 7-day streak', icon: 'award', type: 'streak', requirement: 7, emoji: '🏅' },
  { id: 'two_week_champion', title: 'Two Week Champion', description: 'Achieve a 14-day streak', icon: 'trophy', type: 'streak', requirement: 14, emoji: '🎖️' },
  { id: 'monthly_master', title: '30 day master', description: 'Achieve a 30-day streak', icon: 'crown', type: 'streak', requirement: 30, emoji: '👑' },
  { id: 'habit_hero', title: 'Habit Hero', description: 'Complete 100 habits total', icon: 'shield', type: 'completions', requirement: 100, emoji: '🦸' },
  { id: 'habit_legend', title: 'Habit Legend', description: 'Complete 365 habits total', icon: 'sun', type: 'completions', requirement: 365, emoji: '🌟' },
  { id: 'consistency_king', title: 'Consistency King', description: 'Achieve a 30-day streak on a single habit', icon: 'heart', type: 'single_habit_streak', requirement: 30, emoji: '💎' },
];

// ==================== HELPERS ====================

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
      catch (e) { console.error('[WARN] Failed to parse daysOfWeek:', row.daysOfWeek, e); return undefined; }
    })() : undefined,
    dayOfMonth: row.dayOfMonth || undefined,
    notificationsEnabled: row.notificationsEnabled === 1,
    notificationTime: row.notificationTime || undefined,
    isPaused: row.isPaused === 1,
    pauseUntil: row.pauseUntil || undefined,
    profileId: row.profileId || undefined,
  };
}

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

function rowToCompletion(row: db.CompletionRow): HabitCompletion {
  return {
    id: row.id,
    habitId: row.habitId,
    habitName: row.habitName,
    coinReward: row.coinReward,
    completedAt: row.completedAt,
  };
}

function rowToRedemption(row: db.RedemptionRow): RewardRedemption {
  return {
    id: row.id,
    rewardId: row.rewardId,
    rewardName: row.rewardName,
    cost: row.cost,
    redeemedAt: row.redeemedAt,
  };
}

// ==================== HABIT OPERATIONS ====================

export async function getHabits(): Promise<Habit[]> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    return memoryStore.habits.filter(h => h.profileId === (activeProfileId || 'default'));
  }
  
  try {
    const rows = await db.getAllHabits(await getActiveProfileId());
    return rows.map(rowToHabit);
  } catch (error) {
    console.error('[ERROR] getHabits failed:', error);
    return useMemoryStore ? memoryStore.habits.filter(h => h.profileId === (activeProfileId || 'default')) : [];
  }
}

export async function saveHabit(habit: Partial<Pick<Habit, 'frequency' | 'scheduledTime' | 'daysOfWeek' | 'dayOfMonth' | 'notificationsEnabled' | 'notificationTime'>> & Omit<Habit, 'id' | 'createdAt' | 'frequency' | 'scheduledTime' | 'daysOfWeek' | 'dayOfMonth' | 'notificationsEnabled' | 'notificationTime'>): Promise<Habit> {
  await ensureDbReady();
  
  const validatedHabit = validateHabitInput({
    ...habit,
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
  
  if (useMemoryStore) {
    memoryStore.habits.push(newHabit);
    saveMemoryStore();
    console.log('[STORAGE] Saved habit to memory:', newHabit.name);
    return newHabit;
  }
  
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
    return newHabit;
  } catch (error) {
    console.error('[ERROR] insertHabit failed:', error);
    throw error;
  }
}

export async function deleteHabit(id: string): Promise<void> {
  try {
    if (!id || typeof id !== 'string') {
      console.error('[ERROR] deleteHabit called with invalid id:', id);
      return;
    }
    
    if (useMemoryStore) {
      const habit = memoryStore.habits.find(h => h.id === id);
      if (habit && habit.profileId === (activeProfileId || 'default')) {
        memoryStore.habits = memoryStore.habits.filter(h => h.id !== id);
        saveMemoryStore();
      }
      return;
    }
    
    // Profile isolation check
    if (isEnabled('PROFILE_ISOLATION_CHECKS')) {
      const habit = await db.getHabitById(id);
      if (!habit) return;
      if (habit.profileId !== await getActiveProfileId()) {
        throw new Error('UNAUTHORIZED: Habit belongs to another profile');
      }
    }
    
    if (isEnabled('SOFT_DELETE_ARCHIVE')) {
      await db.archiveHabit(id);
    } else {
      await db.removeHabit(id);
    }
  } catch (error) {
    console.error('[ERROR] deleteHabit failed:', error);
    throw error instanceof Error ? error : new Error('Failed to delete habit');
  }
}

export async function updateHabit(habit: Partial<Pick<Habit, 'name' | 'icon' | 'coinReward' | 'color' | 'frequency' | 'scheduledTime' | 'daysOfWeek' | 'dayOfMonth' | 'notificationsEnabled' | 'notificationTime' | 'profileId'>> & { id: string }): Promise<void> {
  try {
    if (!habit.id) {
      throw new Error('Habit ID is required');
    }
    
    // Profile isolation check
    if (isEnabled('PROFILE_ISOLATION_CHECKS')) {
      const existing = await db.getHabitById(habit.id);
      if (!existing) {
        throw new Error('Habit not found');
      }
      if (existing.profileId !== await getActiveProfileId()) {
        throw new Error('UNAUTHORIZED: Habit belongs to another profile');
      }
    }
    
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
  } catch (error) {
    console.error('[ERROR] updateHabit failed:', error);
    throw error instanceof Error ? error : new Error('Failed to update habit');
  }
}

export function isHabitPaused(habit: Habit): boolean {
  if (!habit.isPaused || !habit.pauseUntil) return false;
  const pauseUntilDate = new Date(habit.pauseUntil);
  return pauseUntilDate > new Date();
}

export async function pauseHabit(habitId: string, days: number): Promise<void> {
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

export async function resumeHabit(habitId: string): Promise<void> {
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

// ==================== COMPLETION OPERATIONS ====================

export async function getCompletions(profileId?: string): Promise<HabitCompletion[]> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    const resolvedProfileId = profileId !== undefined ? profileId : (activeProfileId || 'default');
    return memoryStore.completions.filter(c => {
      const habit = memoryStore.habits.find(h => h.id === c.habitId);
      return habit && habit.profileId === resolvedProfileId;
    });
  }
  
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
  await ensureDbReady();
  
  if (useMemoryStore) {
    return memoryStore.completions.map(c => ({
      ...c,
      profileId: c.profileId || undefined,
    }));
  }
  
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

// Atomic habit completion with duplicate prevention
export async function completeHabit(habit: Habit): Promise<HabitCompletion> {
  try {
    validateHabitInput(habit);
  } catch (error) {
    console.error('[ERROR] completeHabit called with invalid habit:', habit, error);
    throw new Error(`Invalid habit object: ${error}`);
  }

  const targetProfileId = habit.profileId || await getActiveProfileId();
  const today = new Date().toISOString().split('T')[0];

    if (useMemoryStore) {
      const existing = memoryStore.completions.find(c => 
        c.habitId === habit.id && 
        c.completedAt.split('T')[0] === today &&
        c.profileId === targetProfileId
      );
      if (existing) {
        throw new Error('ALREADY_COMPLETED_TODAY');
      }

      const completion: HabitCompletion = {
        id: Crypto.randomUUID(),
        habitId: habit.id,
        habitName: habit.name,
        coinReward: habit.coinReward,
        completedAt: new Date().toISOString(),
        profileId: targetProfileId,
      };

      memoryStore.completions.push(completion);
    memoryStore.walletBalance += habit.coinReward;
    memoryStore.userStats.totalCompletions += 1;
    saveMemoryStore();
    console.log('[STORAGE] Completed habit in memory:', habit.name);
    return completion;
  }

  return await withTransaction(async (database) => {
    // Check for duplicate completion
    const existing = await db.getTodayCompletionForHabit(habit.id, targetProfileId, today);
    if (existing) {
      throw new Error('ALREADY_COMPLETED_TODAY');
    }

    const completion: HabitCompletion = {
      id: Crypto.randomUUID(),
      habitId: habit.id,
      habitName: habit.name,
      coinReward: habit.coinReward,
      completedAt: new Date().toISOString(),
    };

    // Insert completion
    await db.insertCompletion({
      id: completion.id,
      habitId: completion.habitId,
      habitName: completion.habitName,
      coinReward: completion.coinReward,
      completedAt: completion.completedAt,
      profileId: targetProfileId,
    });

    // Add coins
    await db.addToWalletBalance(habit.coinReward, targetProfileId);
    
    // Update stats
    await db.updateUserStats({
      totalCompletions: 1,
    }, targetProfileId);

    return completion;
  });
}

// Atomic uncomplete with streak recalculation
export async function uncompleteHabit(habitId: string, profileId?: string): Promise<void> {
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] uncompleteHabit called with invalid habitId:', habitId);
    return;
  }
  
  const targetProfileId = profileId || await getActiveProfileId();
  const today = new Date().toISOString().split('T')[0];

  if (useMemoryStore) {
    const idx = memoryStore.completions.findIndex(c => 
      c.habitId === habitId && 
      c.completedAt.split('T')[0] === today
    );
    
    if (idx !== -1) {
      const completion = memoryStore.completions[idx];
      memoryStore.completions.splice(idx, 1);
      memoryStore.walletBalance = Math.max(0, memoryStore.walletBalance - completion.coinReward);
      memoryStore.userStats.totalCompletions = Math.max(0, memoryStore.userStats.totalCompletions - 1);
      saveMemoryStore();
    }
    return;
  }

  return await withTransaction(async (database) => {
    const todayCompletion = await db.removeCompletionForHabitToday(habitId, targetProfileId, today);
    
    if (todayCompletion) {
      // Refund coins
      await db.addToWalletBalance(todayCompletion.coinReward, targetProfileId);
      
      // Decrement stats
      const stats = await db.getUserStats(targetProfileId);
      if (stats.totalCompletions > 0) {
        await db.updateUserStats({
          totalCompletions: -1,
        }, targetProfileId);
      }
    }
  });
}

// ==================== REWARD OPERATIONS ====================

export async function getRewards(): Promise<Reward[]> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    return memoryStore.rewards.filter(r => r.profileId === (activeProfileId || 'default'));
  }
  
  try {
    const rows = await db.getAllRewards(await getActiveProfileId());
    return rows.map(rowToReward);
  } catch (error) {
    console.error('[ERROR] getRewards failed:', error);
    return useMemoryStore ? memoryStore.rewards.filter(r => r.profileId === (activeProfileId || 'default')) : [];
  }
}

export async function saveReward(reward: Omit<Reward, "id" | "createdAt">): Promise<Reward> {
  await ensureDbReady();
  
  const validatedReward = validateRewardInput({ ...reward });
  
  const newReward: Reward = {
    ...validatedReward,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  
  if (useMemoryStore) {
    memoryStore.rewards.push(newReward);
    saveMemoryStore();
    console.log('[STORAGE] Saved reward to memory:', newReward.name);
    return newReward;
  }
  
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
    return newReward;
  } catch (error) {
    console.error('[ERROR] insertReward failed:', error);
    throw error;
  }
}

export async function deleteReward(id: string): Promise<void> {
  try {
    if (!id || typeof id !== 'string') {
      console.error('[ERROR] deleteReward called with invalid id:', id);
      return;
    }
    
    if (useMemoryStore) {
      const reward = memoryStore.rewards.find(r => r.id === id);
      if (reward && reward.profileId === (activeProfileId || 'default')) {
        memoryStore.rewards = memoryStore.rewards.filter(r => r.id !== id);
        saveMemoryStore();
      }
      return;
    }
    
    // Profile isolation check
    if (isEnabled('PROFILE_ISOLATION_CHECKS')) {
      const reward = await db.getRewardById(id);
      if (!reward) return;
      if (reward.profileId !== await getActiveProfileId()) {
        throw new Error('UNAUTHORIZED: Reward belongs to another profile');
      }
    }
    
    if (isEnabled('SOFT_DELETE_ARCHIVE')) {
      await db.archiveReward(id);
    } else {
      await db.removeReward(id);
    }
  } catch (error) {
    console.error('[ERROR] deleteReward failed:', error);
    throw error instanceof Error ? error : new Error('Failed to delete reward');
  }
}

export async function updateReward(reward: Partial<Pick<Reward, 'name' | 'icon' | 'cost' | 'color' | 'profileId'>> & { id: string }): Promise<void> {
  try {
    if (!reward.id) {
      throw new Error('Reward ID is required');
    }
    
    // Profile isolation check
    if (isEnabled('PROFILE_ISOLATION_CHECKS')) {
      const existing = await db.getRewardById(reward.id);
      if (!existing) {
        throw new Error('Reward not found');
      }
      if (existing.profileId !== await getActiveProfileId()) {
        throw new Error('UNAUTHORIZED: Reward belongs to another profile');
      }
    }
    
    const updateData: any = { id: reward.id };
    
    if (reward.name !== undefined) updateData.name = reward.name;
    if (reward.icon !== undefined) updateData.icon = reward.icon;
    if (reward.cost !== undefined) updateData.cost = reward.cost;
    if (reward.color !== undefined) updateData.color = reward.color;
    if (reward.profileId !== undefined) updateData.profileId = reward.profileId;
    
    await db.updateReward(updateData);
  } catch (error) {
    console.error('[ERROR] updateReward failed:', error);
    throw error instanceof Error ? error : new Error('Failed to update reward');
  }
}

export async function getRedemptions(profileId?: string): Promise<RewardRedemption[]> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    const resolvedProfileId = profileId !== undefined ? profileId : (activeProfileId || 'default');
    return memoryStore.redemptions.filter(r => {
      const reward = memoryStore.rewards.find(rew => rew.id === r.rewardId);
      return reward && reward.profileId === resolvedProfileId;
    });
  }
  
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
  await ensureDbReady();
  
  if (useMemoryStore) {
    return memoryStore.redemptions.map(r => {
      const reward = memoryStore.rewards.find(rew => rew.id === r.rewardId);
      return { ...r, profileId: reward?.profileId };
    });
  }
  
  try {
    const rows = await db.getAllRedemptions();
    return rows.map(r => ({ ...rowToRedemption(r), profileId: r.profileId || undefined }));
  } catch (error) {
    console.error('[ERROR] getAllProfileRedemptions failed:', error);
    return [];
  }
}

// Atomic reward redemption with balance check
export async function redeemReward(reward: Reward): Promise<RewardRedemption | null> {
  const targetProfileId = reward.profileId || await getActiveProfileId();

  if (useMemoryStore) {
    if (memoryStore.walletBalance < reward.cost) {
      return null;
    }

    // Verify reward exists and belongs to target profile
    const rewardExists = memoryStore.rewards.find(r => r.id === reward.id && r.profileId === targetProfileId);
    if (!rewardExists) {
      console.warn('[STORAGE] Reward not found or profile mismatch:', reward.id, targetProfileId);
      return null;
    }

    const redemption: RewardRedemption = {
      id: Crypto.randomUUID(),
      rewardId: reward.id,
      rewardName: reward.name,
      cost: reward.cost,
      redeemedAt: new Date().toISOString(),
      profileId: targetProfileId,
    };
    
    memoryStore.redemptions.push(redemption);
    memoryStore.walletBalance -= reward.cost;
    saveMemoryStore();
    console.log('[STORAGE] Redeemed reward in memory:', reward.name);
    return redemption;
  }

  return await withTransaction(async (database) => {
    const balance = await db.getWalletBalance(targetProfileId);
    if (balance < reward.cost) {
      return null;
    }

    const redemption: RewardRedemption = {
      id: Crypto.randomUUID(),
      rewardId: reward.id,
      rewardName: reward.name,
      cost: reward.cost,
      redeemedAt: new Date().toISOString(),
    };
    
    await db.insertRedemption({
      id: redemption.id,
      rewardId: redemption.rewardId,
      rewardName: redemption.rewardName,
      cost: redemption.cost,
      redeemedAt: redemption.redeemedAt,
      profileId: targetProfileId,
    });
    
    await db.deductFromWalletBalance(reward.cost, targetProfileId);

    return redemption;
  });
}

// ==================== WALLET OPERATIONS ====================

export async function getBalance(profileId?: string): Promise<number> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    return memoryStore.walletBalance;
  }
  
  try {
    return await db.getWalletBalance(profileId || await getActiveProfileId());
  } catch (error) {
    console.error('[ERROR] getBalance failed:', error);
    return useMemoryStore ? memoryStore.walletBalance : 0;
  }
}

export async function setBalance(balance: number, profileId?: string): Promise<void> {
  await ensureDbReady();
  
  if (typeof balance !== 'number' || isNaN(balance)) {
    throw new Error('Invalid balance value');
  }
  if (balance < 0) {
    throw new Error('Balance cannot be negative');
  }
  
  if (useMemoryStore) {
    memoryStore.walletBalance = balance;
    saveMemoryStore();
    return;
  }
  
  try {
    await db.setWalletBalance(balance, profileId || await getActiveProfileId());
  } catch (error) {
    console.error('[ERROR] setBalance failed:', error);
    throw error instanceof Error ? error : new Error('Failed to set balance');
  }
}

export async function updateBalance(delta: number, profileId?: string): Promise<number> {
  try {
    const currentBalance = await getBalance(profileId);
    const newBalance = currentBalance + delta;
    if (newBalance < 0) {
      throw new Error('Insufficient balance');
    }
    await setBalance(newBalance, profileId);
    return newBalance;
  } catch (error) {
    console.error('[ERROR] updateBalance failed:', error);
    throw error instanceof Error ? error : new Error('Failed to update balance');
  }
}

// ==================== STREAK OPERATIONS ====================

export async function getStreak(habitId: string, profileId?: string): Promise<number> {
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] getStreak called with invalid habitId:', habitId);
    return 0;
  }
  
  try {
    const resolvedProfileId = profileId || await getActiveProfileId();
    const completions = await db.getCompletionsForHabit(habitId, resolvedProfileId);

    if (completions.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if completed today
    const todayStr = today.toISOString().split('T')[0];
    const completedToday = completions.some(c => 
      c.completedAt.split('T')[0] === todayStr
    );

    // Start counting from today if completed, otherwise from yesterday
    const startOffset = completedToday ? 0 : 1;

    for (let i = startOffset; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      const found = completions.some(
        (c) => c.completedAt.split('T')[0] === dateStr
      );

      if (found) {
        streak++;
      } else if (i > startOffset) {
        break;
      }
    }

    return streak;
  } catch (error) {
    console.error('[ERROR] getStreak failed:', error);
    return 0;
  }
}

// ==================== HABIT HELPERS ====================

export function isHabitDueToday(habit: Habit): boolean {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();
  const frequency = habit.frequency || 'once';

  switch (frequency) {
    case 'daily':
      return true;
    case 'weekly':
      if (habit.daysOfWeek && habit.daysOfWeek.length > 0) {
        return habit.daysOfWeek.includes(dayOfWeek);
      }
      return true;
    case 'monthly':
      if (habit.dayOfMonth) {
        return dayOfMonth === habit.dayOfMonth;
      }
      return true;
    case 'once':
    default:
      const createdDate = new Date(habit.createdAt);
      return (
        createdDate.getFullYear() === today.getFullYear() &&
        createdDate.getMonth() === today.getMonth() &&
        createdDate.getDate() === today.getDate()
      );
  }
}

export function getNextOccurrence(habit: Habit): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const frequency = habit.frequency || 'once';

  switch (frequency) {
    case 'daily':
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    case 'weekly': {
      const daysOfWeek = habit.daysOfWeek && habit.daysOfWeek.length > 0 
        ? habit.daysOfWeek 
        : [today.getDay()];
      const currentDay = today.getDay();
      let nextDay = daysOfWeek.find(d => d > currentDay);
      if (nextDay !== undefined) {
        const nextDate = new Date(today);
        nextDate.setDate(nextDate.getDate() + (nextDay - currentDay));
        return nextDate;
      } else {
        const daysUntilNext = 7 - currentDay + daysOfWeek[0];
        const nextDate = new Date(today);
        nextDate.setDate(nextDate.getDate() + daysUntilNext);
        return nextDate;
      }
    }
    case 'monthly': {
      const targetDay = habit.dayOfMonth || today.getDate();
      const currentDay = today.getDate();
      if (targetDay > currentDay) {
        const nextDate = new Date(today);
        nextDate.setDate(targetDay);
        return nextDate;
      } else {
        const nextDate = new Date(today);
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextDate.setDate(Math.min(targetDay, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()));
        return nextDate;
      }
    }
    case 'once':
    default:
      return new Date(habit.createdAt);
  }
}

// ==================== ACHIEVEMENT SYSTEM ====================

export interface UnlockedAchievement {
  id: string;
  trophyId: string;
  unlockedAt: string;
}

export async function getUnlockedAchievements(): Promise<UnlockedAchievement[]> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    return memoryStore.unlockedAchievements;
  }
  
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

export async function getUserStats(profileId?: string): Promise<UserStats> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    return { ...memoryStore.userStats };
  }
  
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
        default:
          progress = 0;
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

// Atomic achievement check and unlock - returns newly unlocked trophies
export async function checkAndUnlockAchievements(
  habit: Habit,
  currentStreak: number
): Promise<Trophy[]> {
  const profileId = await getActiveProfileId();
  const unlockedAchievements = await getUnlockedAchievements();
  const unlockedIds = new Set(unlockedAchievements.map((u) => u.trophyId));
  const stats = await getUserStats();
  const newUnlocked: Trophy[] = [];

  return await withTransaction(async (database) => {
    // Update stats
    await db.updateUserStats({
      totalCompletions: 1,
    }, profileId);

    if (currentStreak > stats.longestStreak) {
      await db.updateUserStats({
        longestStreak: currentStreak,
      }, profileId);
    }

    if (currentStreak > stats.longestSingleHabitStreak) {
      await db.updateUserStats({
        longestSingleHabitStreak: currentStreak,
        longestSingleHabitId: habit.id,
      }, profileId);
    }

    // Get updated stats
    const updatedStats = await db.getUserStats(profileId);

    // Check each trophy
    for (const trophy of TROPHIES) {
      if (unlockedIds.has(trophy.id)) continue;

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
  });
}

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

export function getNextAchievement(trophies: { trophy: Trophy; unlocked: boolean }[]): Trophy | null {
  const locked = trophies.filter((t) => !t.unlocked);
  if (locked.length === 0) return null;
  return locked.sort((a, b) => a.trophy.requirement - b.trophy.requirement)[0].trophy;
}

// ==================== CONSISTENCY SCORE ====================

export async function getConsistencyScore(profileId?: string): Promise<number> {
  try {
    const targetProfileId = profileId || await getActiveProfileId();
    const rows = await db.getAllHabits(targetProfileId);
    const habits = rows.map(rowToHabit);
    const completionRows = await db.getAllCompletions(targetProfileId);
    const completions = completionRows.map(rowToCompletion);
  
    if (habits.length === 0) return 0;
    
    const activeHabits = habits.filter(h => !isHabitPaused(h));
    if (activeHabits.length === 0) return 0;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    let totalScore = 0;
    let habitCount = 0;
    
    for (const habit of activeHabits) {
      const habitCompletions = completions.filter(c => c.habitId === habit.id);
      
      if (habitCompletions.length === 0) {
        const createdDate = new Date(habit.createdAt);
        createdDate.setHours(0, 0, 0, 0);
        const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceCreation === 0) {
          totalScore += 100;
        }
        habitCount++;
        continue;
      }
      
      const completionDates = new Set(
        habitCompletions.map(c => new Date(c.completedAt).toDateString())
      );
      
      const createdDate = new Date(habit.createdAt);
      createdDate.setHours(0, 0, 0, 0);
      const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
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
      
      if (daysDue > 0) {
        const habitScore = Math.round((completedDays / daysDue) * 100);
        totalScore += habitScore;
      } else {
        totalScore += 100;
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

export async function getHabitConsistencyScore(habitId: string): Promise<number> {
  const habits = await getHabits();
  const completions = await getCompletions();
  
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return 0;
  if (isHabitPaused(habit)) return 0;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const habitCompletions = completions.filter(c => c.habitId === habitId);
  
  if (habitCompletions.length === 0) {
    const createdDate = new Date(habit.createdAt);
    createdDate.setHours(0, 0, 0, 0);
    const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceCreation === 0) return 100;
    return 0;
  }
  
  const completionDates = new Set(
    habitCompletions.map(c => new Date(c.completedAt).toDateString())
  );
  
  const createdDate = new Date(habit.createdAt);
  createdDate.setHours(0, 0, 0, 0);
  const daysSinceCreation = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
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

// ==================== SKILL OPERATIONS ====================

export async function getPurchasedSkillIds(): Promise<string[]> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    return [...memoryStore.purchasedSkills];
  }
  
  try {
    const rows = await db.getPurchasedSkills(await getActiveProfileId());
    return rows.map(r => r.skillId);
  } catch (error) {
    console.error('[ERROR] getPurchasedSkillIds failed:', error);
    return [];
  }
}

// Atomic skill purchase with duplicate prevention
export async function savePurchasedSkill(skillId: string): Promise<boolean> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    if (!memoryStore.purchasedSkills.includes(skillId)) {
      memoryStore.purchasedSkills.push(skillId);
      saveMemoryStore();
    }
    return true;
  }
  
  try {
    const result = await db.insertPurchasedSkill({
      id: Crypto.randomUUID(),
      skillId,
      profileId: await getActiveProfileId(),
      purchasedAt: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    console.error('[ERROR] savePurchasedSkill failed:', error);
    throw error;
  }
}

// ==================== ADMIN OPERATIONS ====================

const MAX_BONUS_AMOUNT = FEATURE_FLAGS.PARENT_ACCESS_CONTROL ? 10000 : 999999999;
const BASE_RESTORE_COST = 50;
const MAX_RESTORE_STREAK = 30;

function requireParentProfile(): void {
  if (isEnabled('PARENT_ACCESS_CONTROL') && !isParentProfile()) {
    throw new Error('PARENT_ACCESS_REQUIRED');
  }
}

function validateAmount(amount: number, max: number = MAX_BONUS_AMOUNT): void {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('INVALID_AMOUNT');
  }
  if (amount < 0) {
    throw new Error('INVALID_AMOUNT: Amount cannot be negative');
  }
  if (amount > max) {
    throw new Error(`AMOUNT_EXCEEDS_LIMIT: Maximum allowed is ${max}`);
  }
}

export async function restoreStreakWithCoins(cost?: number): Promise<{ success: boolean; error?: string }> {
  requireParentProfile();
  
  const stats = await getUserStats();
  
  if (stats.longestStreak === 0) {
    return { success: false, error: 'NO_STREAK_TO_RESTORE' };
  }
  
  const calculatedCost = isEnabled('STREAK_RESTORE_V2')
    ? Math.min(stats.longestStreak * BASE_RESTORE_COST, MAX_RESTORE_STREAK * BASE_RESTORE_COST)
    : 500;
  
  if (cost !== undefined && cost !== calculatedCost) {
    return { success: false, error: 'INVALID_COST' };
  }
  
  const balance = await getBalance();
  if (balance < calculatedCost) {
    return { success: false, error: 'INSUFFICIENT_BALANCE' };
  }
  
  return await withTransaction(async (database) => {
    const currentBalance = await db.getWalletBalance(await getActiveProfileId());
    if (currentBalance < calculatedCost) {
      return { success: false, error: 'INSUFFICIENT_BALANCE' };
    }
    
    await db.deductFromWalletBalance(calculatedCost, await getActiveProfileId());
    await db.updateUserStats({
      longestStreak: stats.longestStreak + 1,
    }, await getActiveProfileId());
    
    return { success: true };
  });
}

export async function addBonusPoints(amount: number, profileId?: string): Promise<void> {
  requireParentProfile();
  validateAmount(amount);
  
  const targetProfile = profileId || await getActiveProfileId();
  await db.addToWalletBalance(amount, targetProfile);
}

export async function applyPenaltyPoints(amount: number, profileId?: string): Promise<void> {
  requireParentProfile();
  validateAmount(amount);
  
  const targetProfile = profileId || await getActiveProfileId();
  const currentBalance = await db.getWalletBalance(targetProfile);
  const actualDeduction = Math.min(amount, currentBalance);
  await db.setWalletBalance(currentBalance - actualDeduction, targetProfile);
}

export async function resetStreak(profileId?: string): Promise<void> {
  requireParentProfile();
  
  const targetProfile = profileId || await getActiveProfileId();
  await db.updateUserStats({
    longestStreak: 0,
    longestSingleHabitStreak: 0,
    longestSingleHabitId: undefined,
  }, targetProfile);
}

// Calculate streak restore cost (for UI display)
export function getStreakRestoreCost(currentStreak: number): number {
  if (!isEnabled('STREAK_RESTORE_V2')) {
    return 500;
  }
  return Math.min(currentStreak * BASE_RESTORE_COST, MAX_RESTORE_STREAK * BASE_RESTORE_COST);
}
