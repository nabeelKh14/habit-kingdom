import * as Crypto from "expo-crypto";
import { EventEmitter } from "fbemitter";
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
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==================== MUTATION EVENT EMITTER ====================
// Emits events whenever local data is mutated so sync.ts (or any subscriber)
// can react with realtime/offline-queue logic without tight coupling.

export type MutationTable =
  | 'profiles'
  | 'habits'
  | 'rewards'
  | 'completions'
  | 'redemptions'
  | 'wallet'
  | 'achievements'
  | 'user_stats'
  | 'purchased_skills';

export type MutationOp = 'upsert' | 'delete';

export interface MutationEvent<T = any> {
  table: MutationTable;
  op: MutationOp;
  /** Primary key (or composite key string) of the affected row */
  id: string;
  /** Full row payload for upserts; { id } or composite for deletes */
  record: T;
  /** Owning profile id, when applicable */
  profileId?: string | null;
  /** Local emission timestamp (ISO) */
  at: string;
  /** When true, the event was triggered by an inbound sync (do NOT re-push) */
  fromRemote?: boolean;
}

const ALL_MUTATIONS_EVENT = 'mutation';

export const mutationEmitter = new EventEmitter();

/**
 * Subscribe to ALL local mutation events. Returns an unsubscribe function.
 */
export function onMutation(listener: (event: MutationEvent) => void): () => void {
  const sub = mutationEmitter.addListener(ALL_MUTATIONS_EVENT, listener);
  return () => sub.remove();
}

/**
 * Toggle for sync.ts: when applying remote changes, set true so emitted
 * events are tagged `fromRemote: true` and the queue/pusher can skip them.
 */
let suppressRemoteRebroadcast = false;
export function setRemoteApplyMode(enabled: boolean): void {
  suppressRemoteRebroadcast = enabled;
}

function emitMutation<T>(
  table: MutationTable,
  op: MutationOp,
  id: string,
  record: T,
  profileId?: string | null,
): void {
  try {
    const event: MutationEvent<T> = {
      table,
      op,
      id,
      record,
      profileId: profileId ?? null,
      at: new Date().toISOString(),
      fromRemote: suppressRemoteRebroadcast,
    };
    mutationEmitter.emit(ALL_MUTATIONS_EVENT, event);
  } catch (err) {
    // Listeners must never break storage operations
    console.warn('[STORAGE] mutation listener error:', err);
  }
}

// In-memory store for web fallback
const memoryStore = {
  profiles: [] as Profile[],
  habits: [] as Habit[],
  completions: [] as HabitCompletion[],
  rewards: [] as Reward[],
  redemptions: [] as RewardRedemption[],
  unlockedAchievements: [] as UnlockedAchievement[],
  // Per-profile storage using Maps
  walletBalances: new Map<string, number>(),  // profileId -> balance
  userStatsMap: new Map<string, UserStats>(),    // profileId -> stats
  purchasedSkillsMap: new Map<string, string[]>(), // profileId -> skills[]
  activeProfileId: 'default',
};

async function saveMemoryStore() {
  // Persist across app restarts even when SQLite fails locally
  try {
    const data = {
      profiles: memoryStore.profiles,
      habits: memoryStore.habits,
      completions: memoryStore.completions,
      rewards: memoryStore.rewards,
      redemptions: memoryStore.redemptions,
      unlockedAchievements: memoryStore.unlockedAchievements,
      // Serialize Maps to plain objects for storage
      walletBalances: Object.fromEntries(memoryStore.walletBalances.entries()),
      userStatsMap: Object.fromEntries(memoryStore.userStatsMap.entries()),
      purchasedSkillsMap: Object.fromEntries(memoryStore.purchasedSkillsMap.entries()),
      activeProfileId: memoryStore.activeProfileId,
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[STORAGE] Failed to save memory store:', error);
  }
}

async function loadMemoryStore() {
  try {
    const saved = await AsyncStorage.getItem(SESSION_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      memoryStore.profiles = data.profiles || [];
      memoryStore.habits = data.habits || [];
      memoryStore.completions = data.completions || [];
      memoryStore.rewards = data.rewards || [];
      memoryStore.redemptions = data.redemptions || [];
      memoryStore.unlockedAchievements = data.unlockedAchievements || [];
      // Deserialize Maps from stored objects
      memoryStore.walletBalances = data.walletBalances 
        ? new Map(Object.entries(data.walletBalances)) 
        : new Map<string, number>();
      memoryStore.userStatsMap = data.userStatsMap 
        ? new Map(Object.entries(data.userStatsMap)) 
        : new Map<string, UserStats>();
      memoryStore.purchasedSkillsMap = data.purchasedSkillsMap 
        ? new Map(Object.entries(data.purchasedSkillsMap)) 
        : new Map<string, string[]>();
      memoryStore.activeProfileId = data.activeProfileId || 'default';
      activeProfileId = memoryStore.activeProfileId;
      console.log('[STORAGE] Loaded from AsyncStorage fallback');
    }
  } catch (error) {
    console.warn('[STORAGE] Failed to load from AsyncStorage:', error);
  }
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
      await loadMemoryStore();
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
        await loadMemoryStore();
      }
    }
    dbInitialized = true;
    console.log('[STORAGE] Initialization complete. useMemoryStore =', useMemoryStore);
  })();
  
  return dbInitPromise;
}

// Initialize on first access — export the promise so consumers can await it
export const dbReady: Promise<void> = ensureDbReady();

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
    saveMemoryStore().catch(e => console.error(e));
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
      // Initialize per-profile storage
      memoryStore.walletBalances.set(profile.id, 0);
      memoryStore.userStatsMap.set(profile.id, {
        totalCompletions: 0,
        longestStreak: 0,
        longestSingleHabitStreak: 0,
        longestSingleHabitId: null,
      });
      memoryStore.purchasedSkillsMap.set(profile.id, []);
      saveMemoryStore().catch(e => console.error(e));
      console.log('[STORAGE] Created profile in memory:', profile.name);
    } else {
      await db.insertProfile({
        id: profile.id,
        name: profile.name,
        type: profile.type,
        createdAt: profile.createdAt,
      });
    }

    emitMutation('profiles', 'upsert', profile.id, profile, profile.id);
    emitMutation('wallet', 'upsert', profile.id, { profileId: profile.id, balance: 0 }, profile.id);
    emitMutation('user_stats', 'upsert', profile.id, {
      profileId: profile.id,
      totalCompletions: 0,
      longestStreak: 0,
      longestSingleHabitStreak: 0,
      longestSingleHabitId: null,
    }, profile.id);

    return profile;
  } catch (error) {
    console.error('[ERROR] createProfile failed:', error);
    throw error instanceof Error ? error : new Error('Failed to create profile');
  }
}

export async function renameProfile(id: string, name: string): Promise<void> {
  await ensureDbReady();
  
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
    
    if (useMemoryStore) {
      // Update in-memory store
      memoryStore.profiles = memoryStore.profiles.map(p => {
        if (p.id !== id) return p;
        return { ...p, name: name.trim() };
      });
      saveMemoryStore().catch(e => console.error(e));
      emitMutation('profiles', 'upsert', id, { id, name: name.trim() }, id);
      return;
    }
    
    await db.updateProfile(id, name);
    emitMutation('profiles', 'upsert', id, { id, name: name.trim() }, id);
  } catch (error) {
    console.error('[ERROR] renameProfile failed:', error);
    throw error instanceof Error ? error : new Error('Failed to rename profile');
  }
}

export async function removeProfile(id: string): Promise<void> {
  await ensureDbReady();
  
  try {
    if (!id?.trim()) {
      throw new Error('Profile ID is required');
    }
    if (id === 'default') {
      throw new Error('Cannot delete the default profile');
    }
    
    if (useMemoryStore) {
      // Clean up all profile-related data from memory store
      memoryStore.profiles = memoryStore.profiles.filter(p => p.id !== id);
      memoryStore.walletBalances.delete(id);
      memoryStore.userStatsMap.delete(id);
      memoryStore.purchasedSkillsMap.delete(id);
      // Remove associated habits, completions, rewards, redemptions
      memoryStore.habits = memoryStore.habits.filter(h => h.profileId !== id);
      memoryStore.completions = memoryStore.completions.filter(c => c.profileId !== id);
      memoryStore.rewards = memoryStore.rewards.filter(r => r.profileId !== id);
      memoryStore.redemptions = memoryStore.redemptions.filter(r => r.profileId !== id);
      // If removing active profile, switch to first available
      if (activeProfileId === id) {
        activeProfileId = memoryStore.profiles.length > 0 ? memoryStore.profiles[0].id : 'default';
        memoryStore.activeProfileId = activeProfileId;
    }
    saveMemoryStore().catch(e => console.error(e));
      emitMutation('profiles', 'delete', id, { id }, id);
      return;
    }
    
    await db.removeProfile(id);
    emitMutation('profiles', 'delete', id, { id }, id);
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
  { id: 'first_step', title: 'First Step', description: 'Complete your first habit', icon: 'star', type: 'completions', requirement: 1, emoji: 'ðŸŒŸ' },
  { id: 'getting_started', title: 'Getting Started', description: 'Achieve a 3-day streak', icon: 'zap', type: 'streak', requirement: 3, emoji: 'ðŸ”¥' },
  { id: 'week_warrior', title: 'Week Warrior', description: 'Achieve a 7-day streak', icon: 'award', type: 'streak', requirement: 7, emoji: 'ðŸ…' },
  { id: 'two_week_champion', title: 'Two Week Champion', description: 'Achieve a 14-day streak', icon: 'trophy', type: 'streak', requirement: 14, emoji: 'ðŸŽ–ï¸' },
  { id: 'monthly_master', title: '30 day master', description: 'Achieve a 30-day streak', icon: 'crown', type: 'streak', requirement: 30, emoji: 'ðŸ‘‘' },
  { id: 'habit_hero', title: 'Habit Hero', description: 'Complete 100 habits total', icon: 'shield', type: 'completions', requirement: 100, emoji: 'ðŸ¦¸' },
  { id: 'habit_legend', title: 'Habit Legend', description: 'Complete 365 habits total', icon: 'sun', type: 'completions', requirement: 365, emoji: 'ðŸŒŸ' },
  { id: 'consistency_king', title: 'Consistency King', description: 'Achieve a 30-day streak on a single habit', icon: 'heart', type: 'single_habit_streak', requirement: 30, emoji: 'ðŸ’Ž' },
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
    if (!newHabit.profileId) {
      newHabit.profileId = activeProfileId || 'default';
    }
    memoryStore.habits.push(newHabit);
    saveMemoryStore().catch(e => console.error(e));
    console.log('[STORAGE] Saved habit to memory:', newHabit.name);
    emitMutation('habits', 'upsert', newHabit.id, newHabit, newHabit.profileId);
    return newHabit;
  }
  
    try {
    const resolvedProfileId = newHabit.profileId || await getActiveProfileId() || 'default';
    await db.insertHabit({
      id: newHabit.id,
      name: newHabit.name,
      icon: newHabit.icon,
      coinReward: newHabit.coinReward,
      color: newHabit.color,
      createdAt: newHabit.createdAt,
      frequency: newHabit.frequency,
      scheduledTime: newHabit.scheduledTime === null ? undefined : newHabit.scheduledTime,
      daysOfWeek: newHabit.daysOfWeek ? JSON.stringify(newHabit.daysOfWeek) : undefined,
      dayOfMonth: newHabit.dayOfMonth === null ? undefined : newHabit.dayOfMonth,
      notificationsEnabled: newHabit.notificationsEnabled ? 1 : 0,
      notificationTime: newHabit.notificationTime === null ? undefined : newHabit.notificationTime,
      profileId: resolvedProfileId,
    });
    newHabit.profileId = resolvedProfileId;
    emitMutation('habits', 'upsert', newHabit.id, newHabit, resolvedProfileId);
    return newHabit;
  } catch (error) {
    console.error('[ERROR] insertHabit failed:', error);
    throw error;
  }
}

export async function deleteHabit(id: string): Promise<void> {
  await ensureDbReady();
  
  try {
    if (!id || typeof id !== 'string') {
      console.error('[ERROR] deleteHabit called with invalid id:', id);
      return;
    }
    
    if (useMemoryStore) {
      const habit = memoryStore.habits.find(h => h.id === id);
      if (habit && habit.profileId === (activeProfileId || 'default')) {
        memoryStore.habits = memoryStore.habits.filter(h => h.id !== id);
        saveMemoryStore().catch(e => console.error(e));
        emitMutation('habits', 'delete', id, { id }, habit.profileId);
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
    
    const ownerProfileId = await getActiveProfileId();
    if (isEnabled('SOFT_DELETE_ARCHIVE')) {
      await db.archiveHabit(id);
      emitMutation('habits', 'upsert', id, { id, deletedAt: new Date().toISOString() }, ownerProfileId);
    } else {
      await db.removeHabit(id);
      emitMutation('habits', 'delete', id, { id }, ownerProfileId);
    }
  } catch (error) {
    console.error('[ERROR] deleteHabit failed:', error);
    throw error instanceof Error ? error : new Error('Failed to delete habit');
  }
}

export async function updateHabit(habit: any): Promise<void> {
  await ensureDbReady();
  
  try {
    if (!habit.id) {
      throw new Error('Habit ID is required');
    }
    
    // Profile isolation check - use the habit's profileId if provided, otherwise check active profile
    if (!useMemoryStore && isEnabled('PROFILE_ISOLATION_CHECKS')) {
      const existing = await db.getHabitById(habit.id);
      if (!existing) {
        throw new Error('Habit not found');
      }
      const targetProfileId = habit.profileId || await getActiveProfileId();
      if (existing.profileId && existing.profileId !== targetProfileId) {
        // Allow if we're updating to a new profileId
        if (!habit.profileId || habit.profileId === existing.profileId) {
          throw new Error('UNAUTHORIZED: Habit belongs to another profile');
        }
      }
    }
    
    if (useMemoryStore) {
      // Update in-memory store
      let updatedSnapshot: Habit | null = null;
      memoryStore.habits = memoryStore.habits.map(h => {
        if (h.id !== habit.id) return h;
        
        const updated = { ...h };
        if (habit.name !== undefined) updated.name = habit.name;
        if (habit.icon !== undefined) updated.icon = habit.icon;
        if (habit.coinReward !== undefined) updated.coinReward = habit.coinReward;
        if (habit.color !== undefined) updated.color = habit.color;
        if (habit.frequency !== undefined) updated.frequency = habit.frequency;
        if (habit.scheduledTime !== undefined) updated.scheduledTime = habit.scheduledTime;
        if (habit.daysOfWeek !== undefined) updated.daysOfWeek = habit.daysOfWeek;
        if (habit.dayOfMonth !== undefined) updated.dayOfMonth = habit.dayOfMonth;
        if (habit.notificationsEnabled !== undefined) updated.notificationsEnabled = habit.notificationsEnabled;
        if (habit.notificationTime !== undefined) updated.notificationTime = habit.notificationTime;
        if (habit.profileId !== undefined && habit.profileId !== '') updated.profileId = habit.profileId;
        
        updatedSnapshot = updated;
        return updated;
      });
      saveMemoryStore().catch(e => console.error(e));
      if (updatedSnapshot) {
        emitMutation('habits', 'upsert', habit.id, updatedSnapshot, (updatedSnapshot as Habit).profileId);
      }
      return;
    }
    
    const updateData: any = { id: habit.id };
    
    if (habit.name !== undefined) updateData.name = habit.name;
    if (habit.icon !== undefined) updateData.icon = habit.icon;
    if (habit.coinReward !== undefined) updateData.coinReward = habit.coinReward;
    if (habit.color !== undefined) updateData.color = habit.color;
    if (habit.frequency !== undefined) updateData.frequency = habit.frequency;
    if (habit.scheduledTime !== undefined) updateData.scheduledTime = habit.scheduledTime;
    if (habit.daysOfWeek !== undefined) updateData.daysOfWeek = habit.daysOfWeek ? JSON.stringify(habit.daysOfWeek) : null;
    if (habit.dayOfMonth !== undefined) updateData.dayOfMonth = habit.dayOfMonth;
    if (habit.notificationsEnabled !== undefined) updateData.notificationsEnabled = habit.notificationsEnabled ? 1 : 0;
    if (habit.notificationTime !== undefined) updateData.notificationTime = habit.notificationTime;
    if (habit.profileId !== undefined && habit.profileId !== '') updateData.profileId = habit.profileId;
    
    await db.updateHabit(updateData);
    const fresh = await db.getHabitById(habit.id);
    if (fresh) emitMutation('habits', 'upsert', habit.id, rowToHabit(fresh), fresh.profileId);
    else emitMutation('habits', 'upsert', habit.id, { id: habit.id, ...habit }, habit.profileId ?? null);
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
  await ensureDbReady();
  
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
  
  if (useMemoryStore) {
    let snapshot: Habit | null = null;
    memoryStore.habits = memoryStore.habits.map(h => {
      if (h.id !== habitId) return h;
      snapshot = { ...h, isPaused: true, pauseUntil: pauseUntilDate.toISOString() };
      return snapshot;
    });
    saveMemoryStore().catch(e => console.error(e));
    if (snapshot) emitMutation('habits', 'upsert', habitId, snapshot, (snapshot as Habit).profileId);
    return;
  }
  
  await db.updateHabit({
    id: habitId,
    isPaused: 1,
    pauseUntil: pauseUntilDate.toISOString(),
  });
  const fresh = await db.getHabitById(habitId);
  if (fresh) emitMutation('habits', 'upsert', habitId, rowToHabit(fresh), fresh.profileId);
}

export async function resumeHabit(habitId: string): Promise<void> {
  await ensureDbReady();
  
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] resumeHabit called with invalid habitId:', habitId);
    return;
  }

  if (useMemoryStore) {
    let snapshot: Habit | null = null;
    memoryStore.habits = memoryStore.habits.map(h => {
      if (h.id !== habitId) return h;
      snapshot = { ...h, isPaused: false, pauseUntil: undefined };
      return snapshot;
    });
    saveMemoryStore().catch(e => console.error(e));
    if (snapshot) emitMutation('habits', 'upsert', habitId, snapshot, (snapshot as Habit).profileId);
    return;
  }
  
  await db.updateHabit({
    id: habitId,
    isPaused: 0,
    pauseUntil: undefined,
  });
  const fresh = await db.getHabitById(habitId);
  if (fresh) emitMutation('habits', 'upsert', habitId, rowToHabit(fresh), fresh.profileId);
}

export async function updateHabitNotifications(
  habitId: string,
  notificationsEnabled: boolean,
  notificationTime?: string
): Promise<void> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    let snapshot: Habit | null = null;
    memoryStore.habits = memoryStore.habits.map(h => {
      if (h.id !== habitId) return h;
      snapshot = { 
        ...h, 
        notificationsEnabled, 
        notificationTime: notificationTime || undefined 
      };
      return snapshot;
    });
    saveMemoryStore().catch(e => console.error(e));
    if (snapshot) emitMutation('habits', 'upsert', habitId, snapshot, (snapshot as Habit).profileId);
    return;
  }
  
  await db.updateHabit({
    id: habitId,
    notificationsEnabled: notificationsEnabled ? 1 : 0,
    notificationTime: notificationTime || undefined,
  });
  const fresh = await db.getHabitById(habitId);
  if (fresh) emitMutation('habits', 'upsert', habitId, rowToHabit(fresh), fresh.profileId);
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

// Atomic habit completion with duplicate prevention
export async function getTodayCompletions(): Promise<HabitCompletion[]> {
  const completions = await getCompletions();
  const today = new Date().toISOString().split('T')[0];
  return completions.filter(
    (c) => c.completedAt.split('T')[0] === today
  );
}

export async function completeHabit(habit: Habit): Promise<HabitCompletion> {
  await ensureDbReady();
  
  try {
    validateHabitInput(habit);
  } catch (error) {
    console.error('[ERROR] completeHabit called with invalid habit:', habit, error);
    throw new Error(`Invalid habit object: ${error}`);
  }

  const targetProfileId = habit.profileId || await getActiveProfileId();
  if (!targetProfileId) {
    throw new Error('No active profile found. Please select a profile.');
  }
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
      // Update per-profile wallet balance
      const currentBalance = memoryStore.walletBalances.get(targetProfileId) || 0;
      const newBalance = currentBalance + habit.coinReward;
      memoryStore.walletBalances.set(targetProfileId, newBalance);
      // Update per-profile user stats
      const stats = memoryStore.userStatsMap.get(targetProfileId) || {
        totalCompletions: 0,
        longestStreak: 0,
        longestSingleHabitStreak: 0,
        longestSingleHabitId: null,
      };
      stats.totalCompletions += 1;
      memoryStore.userStatsMap.set(targetProfileId, stats);
      saveMemoryStore().catch(e => console.error(e));
      console.log('[STORAGE] Completed habit in memory:', habit.name);
      emitMutation('completions', 'upsert', completion.id, completion, targetProfileId);
      emitMutation('wallet', 'upsert', targetProfileId, { profileId: targetProfileId, balance: newBalance }, targetProfileId);
      emitMutation('user_stats', 'upsert', targetProfileId, { profileId: targetProfileId, ...stats }, targetProfileId);
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
      profileId: targetProfileId,
    };

    // Insert completion
    await db.insertCompletion({
      id: completion.id,
      habitId: completion.habitId,
      habitName: completion.habitName,
      coinReward: completion.coinReward,
      completedAt: completion.completedAt,
      profileId: targetProfileId,
      createdAt: new Date().toISOString(),
    });

    // Add coins
    await db.addToWalletBalance(habit.coinReward, targetProfileId);
    
    // Update stats
    await db.updateUserStats({
      totalCompletions: 1,
    }, targetProfileId);

    emitMutation('completions', 'upsert', completion.id, { ...completion, profileId: targetProfileId }, targetProfileId);
    const balance = await db.getWalletBalance(targetProfileId);
    emitMutation('wallet', 'upsert', targetProfileId, { profileId: targetProfileId, balance }, targetProfileId);
    const updatedStats = await db.getUserStats(targetProfileId);
    emitMutation('user_stats', 'upsert', targetProfileId, { ...updatedStats }, targetProfileId);
    return completion;
  });
}

// Atomic uncomplete with streak recalculation
export async function uncompleteHabit(habitId: string, profileId?: string): Promise<void> {
  await ensureDbReady();
  
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] uncompleteHabit called with invalid habitId:', habitId);
    return;
  }
  
  const targetProfileId = profileId || await getActiveProfileId();
  const today = new Date().toISOString().split('T')[0];

  if (useMemoryStore) {
    const todayCompletionsForHabit = memoryStore.completions.filter(c => 
      c.habitId === habitId && 
      c.completedAt.split('T')[0] === today &&
      c.profileId === targetProfileId
    ).length;
    // Only the first today completion exists (they can't duplicate)
    const idx = memoryStore.completions.findIndex(c => 
      c.habitId === habitId && 
      c.completedAt.split('T')[0] === today &&
      c.profileId === targetProfileId
    );
    
    if (idx !== -1) {
      const completion = memoryStore.completions[idx];
      memoryStore.completions.splice(idx, 1);
      // Update per-profile wallet balance
      const currentBalance = memoryStore.walletBalances.get(targetProfileId) || 0;
      const newBalance = Math.max(0, currentBalance - completion.coinReward);
      memoryStore.walletBalances.set(targetProfileId, newBalance);
      // Update per-profile user stats
      const stats = memoryStore.userStatsMap.get(targetProfileId) || {
        totalCompletions: 0,
        longestStreak: 0,
        longestSingleHabitStreak: 0,
        longestSingleHabitId: null,
      };
      stats.totalCompletions = Math.max(0, stats.totalCompletions - 1);
      memoryStore.userStatsMap.set(targetProfileId, stats);
      saveMemoryStore().catch(e => console.error(e));
      emitMutation('completions', 'delete', completion.id, { id: completion.id }, targetProfileId);
      emitMutation('wallet', 'upsert', targetProfileId, { profileId: targetProfileId, balance: newBalance }, targetProfileId);
      emitMutation('user_stats', 'upsert', targetProfileId, { profileId: targetProfileId, ...stats }, targetProfileId);
    }
    return;
  }

  return await withTransaction(async (database) => {
    const todayCompletion = await db.removeCompletionForHabitToday(habitId, targetProfileId, today);
    
    if (todayCompletion) {
      // Refund coins — actually deduct since we're uncompleting
      await db.deductFromWalletBalance(todayCompletion.coinReward, targetProfileId);
      
      // Decrement stats
      const stats = await db.getUserStats(targetProfileId);
      if (stats.totalCompletions > 0) {
        await db.updateUserStats({
          totalCompletions: -1,
        }, targetProfileId);
      }

      emitMutation('completions', 'delete', todayCompletion.id, { id: todayCompletion.id }, targetProfileId);
      const balance = await db.getWalletBalance(targetProfileId);
      emitMutation('wallet', 'upsert', targetProfileId, { profileId: targetProfileId, balance }, targetProfileId);
      const updatedStats = await db.getUserStats(targetProfileId);
      emitMutation('user_stats', 'upsert', targetProfileId, { ...updatedStats }, targetProfileId);
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
    if (!newReward.profileId) {
      newReward.profileId = activeProfileId || 'default';
    }
    memoryStore.rewards.push(newReward);
    saveMemoryStore().catch(e => console.error(e));
    console.log('[STORAGE] Saved reward to memory:', newReward.name);
    emitMutation('rewards', 'upsert', newReward.id, newReward, newReward.profileId);
    return newReward;
  }
  
  try {
    const resolvedProfileId = newReward.profileId || await getActiveProfileId();
    await db.insertReward({
      id: newReward.id,
      name: newReward.name,
      icon: newReward.icon,
      cost: newReward.cost,
      color: newReward.color,
      createdAt: newReward.createdAt,
      profileId: resolvedProfileId,
    });
    newReward.profileId = resolvedProfileId;
    emitMutation('rewards', 'upsert', newReward.id, newReward, resolvedProfileId);
    return newReward;
  } catch (error) {
    console.error('[ERROR] insertReward failed:', error);
    throw error;
  }
}

export async function deleteReward(id: string): Promise<void> {
  await ensureDbReady();
  
  try {
    if (!id || typeof id !== 'string') {
      console.error('[ERROR] deleteReward called with invalid id:', id);
      return;
    }
    
    if (useMemoryStore) {
      const reward = memoryStore.rewards.find(r => r.id === id);
      if (reward && reward.profileId === (activeProfileId || 'default')) {
        memoryStore.rewards = memoryStore.rewards.filter(r => r.id !== id);
        saveMemoryStore().catch(e => console.error(e));
        emitMutation('rewards', 'delete', id, { id }, reward.profileId);
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
    
    const ownerProfileId = await getActiveProfileId();
    if (isEnabled('SOFT_DELETE_ARCHIVE')) {
      await db.archiveReward(id);
      emitMutation('rewards', 'upsert', id, { id, deletedAt: new Date().toISOString() }, ownerProfileId);
    } else {
      await db.removeReward(id);
      emitMutation('rewards', 'delete', id, { id }, ownerProfileId);
    }
  } catch (error) {
    console.error('[ERROR] deleteReward failed:', error);
    throw error instanceof Error ? error : new Error('Failed to delete reward');
  }
}

export async function updateReward(reward: Partial<Pick<Reward, 'name' | 'icon' | 'cost' | 'color' | 'profileId'>> & { id: string }): Promise<void> {
  await ensureDbReady();
  
  try {
    if (!reward.id) {
      throw new Error('Reward ID is required');
    }
    
    // Profile isolation check
    if (!useMemoryStore && isEnabled('PROFILE_ISOLATION_CHECKS')) {
      const existing = await db.getRewardById(reward.id);
      if (!existing) {
        throw new Error('Reward not found');
      }
      if (existing.profileId !== await getActiveProfileId()) {
        throw new Error('UNAUTHORIZED: Reward belongs to another profile');
      }
    }
    
    if (useMemoryStore) {
      // Update in-memory store
      let snapshot: Reward | null = null;
      memoryStore.rewards = memoryStore.rewards.map(r => {
        if (r.id !== reward.id) return r;
        
        const updated = { ...r };
        if (reward.name !== undefined) updated.name = reward.name;
        if (reward.icon !== undefined) updated.icon = reward.icon;
        if (reward.cost !== undefined) updated.cost = reward.cost;
        if (reward.color !== undefined) updated.color = reward.color;
        if (reward.profileId !== undefined) updated.profileId = reward.profileId;
        
        snapshot = updated;
        return updated;
      });
      saveMemoryStore().catch(e => console.error(e));
      if (snapshot) emitMutation('rewards', 'upsert', reward.id, snapshot, (snapshot as Reward).profileId);
      return;
    }
    
    const updateData: any = { id: reward.id };
    
    if (reward.name !== undefined) updateData.name = reward.name;
    if (reward.icon !== undefined) updateData.icon = reward.icon;
    if (reward.cost !== undefined) updateData.cost = reward.cost;
    if (reward.color !== undefined) updateData.color = reward.color;
    if (reward.profileId !== undefined) updateData.profileId = reward.profileId;
    
    if (Object.keys(updateData).length === 0) return;
    
    await db.updateReward(updateData);
    const fresh = await db.getRewardById(reward.id);
    if (fresh) emitMutation('rewards', 'upsert', reward.id, rowToReward(fresh), fresh.profileId);
    else emitMutation('rewards', 'upsert', reward.id, { ...reward }, reward.profileId ?? null);
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
  await ensureDbReady();
  
  const targetProfileId = reward.profileId || await getActiveProfileId();

  if (useMemoryStore) {
    const currentBalance = memoryStore.walletBalances.get(targetProfileId) || 0;
    if (currentBalance < reward.cost) {
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
    const newBalance = currentBalance - reward.cost;
    memoryStore.walletBalances.set(targetProfileId, newBalance);
    saveMemoryStore().catch(e => console.error(e));
    console.log('[STORAGE] Redeemed reward in memory:', reward.name);
    emitMutation('redemptions', 'upsert', redemption.id, redemption, targetProfileId);
    emitMutation('wallet', 'upsert', targetProfileId, { profileId: targetProfileId, balance: newBalance }, targetProfileId);
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
      profileId: targetProfileId,
    };
    
    await db.insertRedemption({
      id: redemption.id,
      rewardId: redemption.rewardId,
      rewardName: redemption.rewardName,
      cost: redemption.cost,
      redeemedAt: redemption.redeemedAt,
      profileId: targetProfileId,
      createdAt: new Date().toISOString(),
    });
    
    await db.deductFromWalletBalance(reward.cost, targetProfileId);

    emitMutation('redemptions', 'upsert', redemption.id, redemption, targetProfileId);
    const newBalance = await db.getWalletBalance(targetProfileId);
    emitMutation('wallet', 'upsert', targetProfileId, { profileId: targetProfileId, balance: newBalance }, targetProfileId);
    return redemption;
  });
}

// ==================== WALLET OPERATIONS ====================

export async function getBalance(profileId?: string): Promise<number> {
  await ensureDbReady();
  
  if (useMemoryStore) {
    const targetId = profileId || activeProfileId || 'default';
    return memoryStore.walletBalances.get(targetId) || 0;
  }
  
  try {
    return await db.getWalletBalance(profileId || await getActiveProfileId());
  } catch (error) {
    console.error('[ERROR] getBalance failed:', error);
    return useMemoryStore ? (memoryStore.walletBalances.get(activeProfileId || 'default') || 0) : 0;
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
    const targetId = profileId || activeProfileId || 'default';
    memoryStore.walletBalances.set(targetId, balance);
    saveMemoryStore().catch(e => console.error(e));
    emitMutation('wallet', 'upsert', targetId, { profileId: targetId, balance }, targetId);
    return;
  }
  
  try {
    const targetId = profileId || await getActiveProfileId();
    await db.setWalletBalance(balance, targetId);
    emitMutation('wallet', 'upsert', targetId, { profileId: targetId, balance }, targetId);
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
  await ensureDbReady();
  
  if (!habitId || typeof habitId !== 'string') {
    console.error('[ERROR] getStreak called with invalid habitId:', habitId);
    return 0;
  }
  
  try {
    const resolvedProfileId = profileId || await getActiveProfileId();
    
    let completions: { completedAt: string }[];
    
    if (useMemoryStore) {
      // Get completions from memory store
      completions = memoryStore.completions
        .filter(c => c.habitId === habitId && c.profileId === resolvedProfileId)
        .map(c => ({ completedAt: c.completedAt }));
    } else {
      completions = await db.getCompletionsForHabit(habitId, resolvedProfileId);
    }

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
  profileId?: string | null;
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
    const targetId = profileId || activeProfileId || 'default';
    const stats = memoryStore.userStatsMap.get(targetId);
    if (stats) {
      return { ...stats };
    } else {
      // Return default stats if not found
      return {
        totalCompletions: 0,
        longestStreak: 0,
        longestSingleHabitStreak: 0,
        longestSingleHabitId: null,
      };
    }
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
  await ensureDbReady();
  
  const profileId = habit.profileId || await getActiveProfileId();
  if (!profileId) {
    throw new Error('No profile ID found for achievement check');
  }
  
  if (useMemoryStore) {
    const unlockedAchievements = await getUnlockedAchievements();
    const unlockedIds = new Set(unlockedAchievements.map((u) => u.trophyId));
    const stats = await getUserStats(profileId);
    const newUnlocked: Trophy[] = [];
    
    // Update stats in memory
    const updatedStats = { ...stats };
    updatedStats.totalCompletions += 1;
    if (currentStreak > updatedStats.longestStreak) {
      updatedStats.longestStreak = currentStreak;
    }
    if (currentStreak > updatedStats.longestSingleHabitStreak) {
      updatedStats.longestSingleHabitStreak = currentStreak;
      updatedStats.longestSingleHabitId = habit.id;
    }
    memoryStore.userStatsMap.set(profileId, updatedStats);
    
    // Check trophies
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
        const achievement = {
          id: Crypto.randomUUID(),
          trophyId: trophy.id,
          unlockedAt: new Date().toISOString(),
          profileId,
        };
        memoryStore.unlockedAchievements.push(achievement);
        emitMutation('achievements', 'upsert', achievement.id, achievement, profileId);
        newUnlocked.push(trophy);
      }
    }
    
    saveMemoryStore().catch(e => console.error(e));
    emitMutation('user_stats', 'upsert', profileId, { profileId, ...updatedStats }, profileId);
    return newUnlocked;
  }
  
  const unlockedAchievements = await getUnlockedAchievements();
  const unlockedIds = new Set(unlockedAchievements.map((u) => u.trophyId));
  const stats = await getUserStats(profileId);
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
        const achievement = {
          id: Crypto.randomUUID(),
          trophyId: trophy.id,
          unlockedAt: new Date().toISOString(),
          profileId,
          createdAt: new Date().toISOString(),
        };
        await db.insertAchievement(achievement);
        emitMutation('achievements', 'upsert', achievement.id, achievement, profileId);
        newUnlocked.push(trophy);
      }
    }

    emitMutation('user_stats', 'upsert', profileId, { ...updatedStats }, profileId);
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
    const targetId = activeProfileId || 'default';
    const skills = memoryStore.purchasedSkillsMap.get(targetId);
    return skills ? [...skills] : [];
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
    const targetId = await getActiveProfileId();
    const skills = memoryStore.purchasedSkillsMap.get(targetId) || [];
    if (!skills.includes(skillId)) {
      skills.push(skillId);
      memoryStore.purchasedSkillsMap.set(targetId, skills);
      saveMemoryStore().catch(e => console.error(e));
      emitMutation('purchased_skills', 'upsert', `${targetId}:${skillId}`, { skillId, profileId: targetId, purchasedAt: new Date().toISOString() }, targetId);
    }
    return true;
  }
  
  try {
    const targetId = await getActiveProfileId();
    const purchasedAt = new Date().toISOString();
    const skillRowId = Crypto.randomUUID();
    const result = await db.insertPurchasedSkill({
      id: skillRowId,
      skillId,
      profileId: targetId,
      purchasedAt,
      createdAt: purchasedAt,
    });
    if (result) {
      emitMutation('purchased_skills', 'upsert', skillRowId, { id: skillRowId, skillId, profileId: targetId, purchasedAt }, targetId);
    }
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
  await ensureDbReady();
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
  
  const targetProfile = await getActiveProfileId();
  
  if (useMemoryStore) {
    const currentBalance = memoryStore.walletBalances.get(targetProfile) || 0;
    if (currentBalance < calculatedCost) {
      return { success: false, error: 'INSUFFICIENT_BALANCE' };
    }
    const newBalance = currentBalance - calculatedCost;
    memoryStore.walletBalances.set(targetProfile, newBalance);
    const updatedStats = { ...stats };
    updatedStats.longestStreak = stats.longestStreak + 1;
    memoryStore.userStatsMap.set(targetProfile, updatedStats);
    saveMemoryStore().catch(e => console.error(e));
    emitMutation('wallet', 'upsert', targetProfile, { profileId: targetProfile, balance: newBalance }, targetProfile);
    emitMutation('user_stats', 'upsert', targetProfile, { profileId: targetProfile, ...updatedStats }, targetProfile);
    return { success: true };
  }
  
  return await withTransaction(async (database) => {
    const currentBalance = await db.getWalletBalance(targetProfile);
    if (currentBalance < calculatedCost) {
      return { success: false, error: 'INSUFFICIENT_BALANCE' };
    }
    
    await db.deductFromWalletBalance(calculatedCost, targetProfile);
    await db.updateUserStats({
      longestStreak: stats.longestStreak + 1,
    }, targetProfile);
    
    const newBalance = await db.getWalletBalance(targetProfile);
    emitMutation('wallet', 'upsert', targetProfile, { profileId: targetProfile, balance: newBalance }, targetProfile);
    const updatedStats = await db.getUserStats(targetProfile);
    emitMutation('user_stats', 'upsert', targetProfile, { ...updatedStats }, targetProfile);
    return { success: true };
  });
}

export async function addBonusPoints(amount: number, profileId?: string): Promise<void> {
  await ensureDbReady();
  validateAmount(amount);
  
  const targetProfile = profileId || await getActiveProfileId();
  
  if (useMemoryStore) {
    const currentBalance = memoryStore.walletBalances.get(targetProfile) || 0;
    const newBalance = currentBalance + amount;
    memoryStore.walletBalances.set(targetProfile, newBalance);
    saveMemoryStore().catch(e => console.error(e));
    emitMutation('wallet', 'upsert', targetProfile, { profileId: targetProfile, balance: newBalance }, targetProfile);
    return;
  }
  
  await db.addToWalletBalance(amount, targetProfile);
  const newBalance = await db.getWalletBalance(targetProfile);
  emitMutation('wallet', 'upsert', targetProfile, { profileId: targetProfile, balance: newBalance }, targetProfile);
}

export async function applyPenaltyPoints(amount: number, profileId?: string): Promise<void> {
  await ensureDbReady();
  validateAmount(amount);
  
  const targetProfile = profileId || await getActiveProfileId();
  
  if (useMemoryStore) {
    const currentBalance = memoryStore.walletBalances.get(targetProfile) || 0;
    const actualDeduction = Math.min(amount, currentBalance);
    const newBalance = currentBalance - actualDeduction;
    memoryStore.walletBalances.set(targetProfile, newBalance);
    saveMemoryStore().catch(e => console.error(e));
    emitMutation('wallet', 'upsert', targetProfile, { profileId: targetProfile, balance: newBalance }, targetProfile);
    return;
  }
  
  const currentBalance = await db.getWalletBalance(targetProfile);
  const actualDeduction = Math.min(amount, currentBalance);
  const newBalance = currentBalance - actualDeduction;
  await db.setWalletBalance(newBalance, targetProfile);
  emitMutation('wallet', 'upsert', targetProfile, { profileId: targetProfile, balance: newBalance }, targetProfile);
}

export async function resetStreak(profileId?: string): Promise<void> {
  await ensureDbReady();
  
  const targetProfile = profileId || await getActiveProfileId();
  
  if (useMemoryStore) {
    const stats = memoryStore.userStatsMap.get(targetProfile) || {
      totalCompletions: 0,
      longestStreak: 0,
      longestSingleHabitStreak: 0,
      longestSingleHabitId: null,
    };
    stats.longestStreak = 0;
    stats.longestSingleHabitStreak = 0;
    stats.longestSingleHabitId = null;
    memoryStore.userStatsMap.set(targetProfile, stats);
    saveMemoryStore().catch(e => console.error(e));
    emitMutation('user_stats', 'upsert', targetProfile, { profileId: targetProfile, ...stats }, targetProfile);
    return;
  }
  
  await db.updateUserStats({
    longestStreak: 0,
    longestSingleHabitStreak: 0,
    longestSingleHabitId: null,
  }, targetProfile);
  const updatedStats = await db.getUserStats(targetProfile);
  emitMutation('user_stats', 'upsert', targetProfile, { ...updatedStats }, targetProfile);
}

// Calculate streak restore cost (for UI display)
export function getStreakRestoreCost(currentStreak: number): number {
  if (!isEnabled('STREAK_RESTORE_V2')) {
    return 500;
  }
  return Math.min(currentStreak * BASE_RESTORE_COST, MAX_RESTORE_STREAK * BASE_RESTORE_COST);
}

// ==================== REMOTE-APPLY HELPERS (for sync.ts) ====================
// These intentionally bypass validation because the data has already been
// validated by Supabase and is being mirrored locally. They flip
// `suppressRemoteRebroadcast` so the resulting emitted events are tagged
// `fromRemote: true` and the offline queue can ignore them.

export interface RemoteRecord {
  table: MutationTable;
  /** Primary key (or composite key string for purchased_skills) */
  id: string;
  /** Owning profile id */
  profileId?: string | null;
  /** Full row payload from Supabase (snake_case-tolerant: we normalize) */
  data: Record<string, any>;
}

function normalizeHabitRecord(row: Record<string, any>): {
  id: string; name: string; icon: string; coinReward: number; color: string; createdAt: string;
  frequency: string; scheduledTime?: string; daysOfWeek?: string; dayOfMonth?: number;
  notificationsEnabled: number; notificationTime?: string; isPaused?: number; pauseUntil?: string; profileId: string;
} {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    coinReward: row.coinReward ?? row.coin_reward ?? 0,
    color: row.color,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    frequency: row.frequency ?? 'once',
    scheduledTime: row.scheduledTime ?? row.scheduled_time ?? undefined,
    daysOfWeek: row.daysOfWeek ?? row.days_of_week ?? undefined,
    dayOfMonth: row.dayOfMonth ?? row.day_of_month ?? undefined,
    notificationsEnabled: (row.notificationsEnabled ?? row.notifications_enabled) ? 1 : 0,
    notificationTime: row.notificationTime ?? row.notification_time ?? undefined,
    isPaused: (row.isPaused ?? row.is_paused) ? 1 : 0,
    pauseUntil: row.pauseUntil ?? row.pause_until ?? undefined,
    profileId: row.profileId ?? row.profile_id,
  };
}

function normalizeRewardRecord(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    cost: row.cost,
    color: row.color,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    profileId: row.profileId ?? row.profile_id,
  };
}

function normalizeCompletionRecord(row: Record<string, any>) {
  return {
    id: row.id,
    habitId: row.habitId ?? row.habit_id,
    habitName: row.habitName ?? row.habit_name,
    coinReward: row.coinReward ?? row.coin_reward ?? 0,
    completedAt: row.completedAt ?? row.completed_at ?? new Date().toISOString(),
    profileId: row.profileId ?? row.profile_id,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
  };
}

function normalizeRedemptionRecord(row: Record<string, any>) {
  return {
    id: row.id,
    rewardId: row.rewardId ?? row.reward_id,
    rewardName: row.rewardName ?? row.reward_name,
    cost: row.cost,
    redeemedAt: row.redeemedAt ?? row.redeemed_at ?? new Date().toISOString(),
    profileId: row.profileId ?? row.profile_id,
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
  };
}

async function applyRemoteUpsertMemory(rec: RemoteRecord): Promise<void> {
  switch (rec.table) {
    case 'profiles': {
      const profile: Profile = {
        id: rec.data.id,
        name: rec.data.name,
        type: (rec.data.type as 'child' | 'parent') ?? 'child',
        createdAt: rec.data.createdAt ?? rec.data.created_at ?? new Date().toISOString(),
      };
      const idx = memoryStore.profiles.findIndex(p => p.id === profile.id);
      if (idx >= 0) memoryStore.profiles[idx] = profile;
      else memoryStore.profiles.push(profile);
      if (!memoryStore.walletBalances.has(profile.id)) memoryStore.walletBalances.set(profile.id, 0);
      if (!memoryStore.userStatsMap.has(profile.id)) {
        memoryStore.userStatsMap.set(profile.id, {
          totalCompletions: 0, longestStreak: 0, longestSingleHabitStreak: 0, longestSingleHabitId: null,
        });
      }
      return;
    }
    case 'habits': {
      const h = normalizeHabitRecord(rec.data);
      const habit: Habit = {
        id: h.id, name: h.name, icon: h.icon, coinReward: h.coinReward, color: h.color, createdAt: h.createdAt,
        frequency: h.frequency as Habit['frequency'],
        scheduledTime: h.scheduledTime, dayOfMonth: h.dayOfMonth,
        daysOfWeek: h.daysOfWeek ? (() => { try { return JSON.parse(h.daysOfWeek as any); } catch { return undefined; } })() : undefined,
        notificationsEnabled: !!h.notificationsEnabled, notificationTime: h.notificationTime,
        isPaused: !!h.isPaused, pauseUntil: h.pauseUntil, profileId: h.profileId,
      };
      const idx = memoryStore.habits.findIndex(x => x.id === habit.id);
      if (idx >= 0) memoryStore.habits[idx] = habit;
      else memoryStore.habits.push(habit);
      return;
    }
    case 'rewards': {
      const r = normalizeRewardRecord(rec.data);
      const reward: Reward = { id: r.id, name: r.name, icon: r.icon, cost: r.cost, color: r.color, createdAt: r.createdAt, profileId: r.profileId };
      const idx = memoryStore.rewards.findIndex(x => x.id === reward.id);
      if (idx >= 0) memoryStore.rewards[idx] = reward;
      else memoryStore.rewards.push(reward);
      return;
    }
    case 'completions': {
      const c = normalizeCompletionRecord(rec.data);
      const completion: HabitCompletion = { id: c.id, habitId: c.habitId, habitName: c.habitName, coinReward: c.coinReward, completedAt: c.completedAt, profileId: c.profileId };
      const idx = memoryStore.completions.findIndex(x => x.id === completion.id);
      if (idx >= 0) memoryStore.completions[idx] = completion;
      else memoryStore.completions.push(completion);
      return;
    }
    case 'redemptions': {
      const r = normalizeRedemptionRecord(rec.data);
      const redemption: RewardRedemption = { id: r.id, rewardId: r.rewardId, rewardName: r.rewardName, cost: r.cost, redeemedAt: r.redeemedAt, profileId: r.profileId };
      const idx = memoryStore.redemptions.findIndex(x => x.id === redemption.id);
      if (idx >= 0) memoryStore.redemptions[idx] = redemption;
      else memoryStore.redemptions.push(redemption);
      return;
    }
    case 'wallet': {
      const pid = rec.data.profileId ?? rec.data.profile_id ?? rec.profileId;
      if (pid) memoryStore.walletBalances.set(pid, rec.data.balance ?? 0);
      return;
    }
    case 'achievements': {
      const a: UnlockedAchievement = {
        id: rec.data.id,
        trophyId: rec.data.trophyId ?? rec.data.trophy_id,
        unlockedAt: rec.data.unlockedAt ?? rec.data.unlocked_at ?? new Date().toISOString(),
        profileId: rec.data.profileId ?? rec.data.profile_id ?? null,
      };
      const idx = memoryStore.unlockedAchievements.findIndex(x => x.id === a.id);
      if (idx >= 0) memoryStore.unlockedAchievements[idx] = a;
      else memoryStore.unlockedAchievements.push(a);
      return;
    }
    case 'user_stats': {
      const pid = rec.data.profileId ?? rec.data.profile_id ?? rec.profileId;
      if (!pid) return;
      memoryStore.userStatsMap.set(pid, {
        totalCompletions: rec.data.totalCompletions ?? rec.data.total_completions ?? 0,
        longestStreak: rec.data.longestStreak ?? rec.data.longest_streak ?? 0,
        longestSingleHabitStreak: rec.data.longestSingleHabitStreak ?? rec.data.longest_single_habit_streak ?? 0,
        longestSingleHabitId: rec.data.longestSingleHabitId ?? rec.data.longest_single_habit_id ?? null,
      });
      return;
    }
    case 'purchased_skills': {
      const pid = rec.data.profileId ?? rec.data.profile_id ?? rec.profileId;
      const skillId = rec.data.skillId ?? rec.data.skill_id;
      if (!pid || !skillId) return;
      const list = memoryStore.purchasedSkillsMap.get(pid) || [];
      if (!list.includes(skillId)) list.push(skillId);
      memoryStore.purchasedSkillsMap.set(pid, list);
      return;
    }
  }
}

async function applyRemoteDeleteMemory(rec: RemoteRecord): Promise<void> {
  switch (rec.table) {
    case 'profiles':
      memoryStore.profiles = memoryStore.profiles.filter(p => p.id !== rec.id);
      memoryStore.walletBalances.delete(rec.id);
      memoryStore.userStatsMap.delete(rec.id);
      memoryStore.purchasedSkillsMap.delete(rec.id);
      memoryStore.habits = memoryStore.habits.filter(h => h.profileId !== rec.id);
      memoryStore.rewards = memoryStore.rewards.filter(r => r.profileId !== rec.id);
      memoryStore.completions = memoryStore.completions.filter(c => c.profileId !== rec.id);
      memoryStore.redemptions = memoryStore.redemptions.filter(r => r.profileId !== rec.id);
      return;
    case 'habits':
      memoryStore.habits = memoryStore.habits.filter(h => h.id !== rec.id);
      return;
    case 'rewards':
      memoryStore.rewards = memoryStore.rewards.filter(r => r.id !== rec.id);
      return;
    case 'completions':
      memoryStore.completions = memoryStore.completions.filter(c => c.id !== rec.id);
      return;
    case 'redemptions':
      memoryStore.redemptions = memoryStore.redemptions.filter(r => r.id !== rec.id);
      return;
    case 'achievements':
      memoryStore.unlockedAchievements = memoryStore.unlockedAchievements.filter(a => a.id !== rec.id);
      return;
    case 'wallet':
    case 'user_stats':
    case 'purchased_skills':
      // No-op: these are owned rows that get reset rather than deleted
      return;
  }
}

async function applyRemoteUpsertSqlite(rec: RemoteRecord): Promise<void> {
  switch (rec.table) {
    case 'profiles': {
      const existing = (await db.getAllProfiles()).find(p => p.id === rec.data.id);
      if (existing) {
        if (rec.data.name && rec.data.name !== existing.name) {
          await db.updateProfile(rec.data.id, rec.data.name);
        }
      } else {
        await db.insertProfile({
          id: rec.data.id,
          name: rec.data.name,
          type: rec.data.type ?? 'child',
          createdAt: rec.data.createdAt ?? rec.data.created_at ?? new Date().toISOString(),
        });
      }
      return;
    }
    case 'habits': {
      const h = normalizeHabitRecord(rec.data);
      const existing = await db.getHabitById(h.id);
      if (existing) {
        await db.updateHabit({
          id: h.id, name: h.name, icon: h.icon, coinReward: h.coinReward, color: h.color,
          frequency: h.frequency, scheduledTime: h.scheduledTime, daysOfWeek: h.daysOfWeek,
          dayOfMonth: h.dayOfMonth, notificationsEnabled: h.notificationsEnabled,
          notificationTime: h.notificationTime, isPaused: h.isPaused, pauseUntil: h.pauseUntil,
          profileId: h.profileId,
        });
      } else {
        await db.insertHabit({
          id: h.id, name: h.name, icon: h.icon, coinReward: h.coinReward, color: h.color,
          createdAt: h.createdAt, frequency: h.frequency, scheduledTime: h.scheduledTime,
          daysOfWeek: h.daysOfWeek, dayOfMonth: h.dayOfMonth,
          notificationsEnabled: h.notificationsEnabled, notificationTime: h.notificationTime,
          profileId: h.profileId,
        });
      }
      return;
    }
    case 'rewards': {
      const r = normalizeRewardRecord(rec.data);
      const existing = await db.getRewardById(r.id);
      if (existing) {
        await db.updateReward({ id: r.id, name: r.name, icon: r.icon, cost: r.cost, color: r.color, profileId: r.profileId });
      } else {
        await db.insertReward({ id: r.id, name: r.name, icon: r.icon, cost: r.cost, color: r.color, createdAt: r.createdAt, profileId: r.profileId });
      }
      return;
    }
    case 'completions': {
      const c = normalizeCompletionRecord(rec.data);
      try {
        await db.insertCompletion({ id: c.id, habitId: c.habitId, habitName: c.habitName, coinReward: c.coinReward, completedAt: c.completedAt, profileId: c.profileId, createdAt: c.createdAt });
      } catch {
        // already exists (PK conflict) — ignore
      }
      return;
    }
    case 'redemptions': {
      const r = normalizeRedemptionRecord(rec.data);
      try {
        await db.insertRedemption({ id: r.id, rewardId: r.rewardId, rewardName: r.rewardName, cost: r.cost, redeemedAt: r.redeemedAt, profileId: r.profileId, createdAt: r.createdAt });
      } catch {
        // already exists
      }
      return;
    }
    case 'wallet': {
      const pid = rec.data.profileId ?? rec.data.profile_id ?? rec.profileId;
      if (pid) await db.setWalletBalance(rec.data.balance ?? 0, pid);
      return;
    }
    case 'achievements': {
      const pid = rec.data.profileId ?? rec.data.profile_id ?? rec.profileId;
      try {
        await db.insertAchievement({
          id: rec.data.id,
          trophyId: rec.data.trophyId ?? rec.data.trophy_id,
          unlockedAt: rec.data.unlockedAt ?? rec.data.unlocked_at ?? new Date().toISOString(),
          profileId: pid,
          createdAt: rec.data.createdAt ?? rec.data.created_at ?? new Date().toISOString(),
        });
      } catch {
        // already unlocked
      }
      return;
    }
    case 'user_stats': {
      const pid = rec.data.profileId ?? rec.data.profile_id ?? rec.profileId;
      if (!pid) return;
      const current = await db.getUserStats(pid);
      await db.updateUserStats({
        totalCompletions: (rec.data.totalCompletions ?? rec.data.total_completions ?? 0) - current.totalCompletions,
        longestStreak: (rec.data.longestStreak ?? rec.data.longest_streak ?? current.longestStreak),
        longestSingleHabitStreak: (rec.data.longestSingleHabitStreak ?? rec.data.longest_single_habit_streak ?? current.longestSingleHabitStreak),
        longestSingleHabitId: rec.data.longestSingleHabitId ?? rec.data.longest_single_habit_id ?? current.longestSingleHabitId,
      }, pid);
      return;
    }
    case 'purchased_skills': {
      const pid = rec.data.profileId ?? rec.data.profile_id ?? rec.profileId;
      const skillId = rec.data.skillId ?? rec.data.skill_id;
      if (!pid || !skillId) return;
      try {
        await db.insertPurchasedSkill({
          id: rec.data.id ?? Crypto.randomUUID(),
          skillId,
          profileId: pid,
          purchasedAt: rec.data.purchasedAt ?? rec.data.purchased_at ?? new Date().toISOString(),
          createdAt: rec.data.createdAt ?? rec.data.created_at ?? new Date().toISOString(),
        });
      } catch {
        // already owned
      }
      return;
    }
  }
}

async function applyRemoteDeleteSqlite(rec: RemoteRecord): Promise<void> {
  switch (rec.table) {
    case 'profiles': await db.removeProfile(rec.id); return;
    case 'habits': await db.removeHabit(rec.id); return;
    case 'rewards': await db.removeReward(rec.id); return;
    case 'completions': await db.removeCompletion(rec.id); return;
    case 'redemptions':
    case 'achievements':
    case 'wallet':
    case 'user_stats':
    case 'purchased_skills':
      // No db.remove* helper available; safe to skip — full pull will reconcile
      return;
  }
}

/**
 * Apply an upsert from Supabase to local storage WITHOUT re-pushing it.
 * Emits a mutation event tagged `fromRemote: true`.
 */
export async function applyRemoteUpsert(rec: RemoteRecord): Promise<void> {
  await ensureDbReady();
  suppressRemoteRebroadcast = true;
  try {
    if (useMemoryStore) {
      await applyRemoteUpsertMemory(rec);
      saveMemoryStore().catch(e => console.error(e));
    } else {
      await applyRemoteUpsertSqlite(rec);
    }
    emitMutation(rec.table, 'upsert', rec.id, rec.data, rec.profileId ?? null);
  } finally {
    suppressRemoteRebroadcast = false;
  }
}

/**
 * Apply a delete from Supabase to local storage WITHOUT re-pushing it.
 */
export async function applyRemoteDelete(rec: RemoteRecord): Promise<void> {
  await ensureDbReady();
  suppressRemoteRebroadcast = true;
  try {
    if (useMemoryStore) {
      await applyRemoteDeleteMemory(rec);
      saveMemoryStore().catch(e => console.error(e));
    } else {
      await applyRemoteDeleteSqlite(rec);
    }
    emitMutation(rec.table, 'delete', rec.id, { id: rec.id }, rec.profileId ?? null);
  } finally {
    suppressRemoteRebroadcast = false;
  }
}

export async function logout(): Promise<void> {
  await ensureDbReady();
  
  // Clear local SQLite database
  const { clearDatabase } = await import('./db');
  await clearDatabase();
  
  // Clear AsyncStorage / Onboarding variables
  await AsyncStorage.removeItem(SESSION_KEY);
  const { resetOnboarding } = await import('./onboarding-storage');
  await resetOnboarding();
  
  // Clear profile cache
  clearProfileState();
  
  // Unregister push token before sign-out (so server stops sending)
  try {
    const Notifications = await import("expo-notifications");
    const { supabase: supabaseLocal } = await import('./supabase');
    const { data: { session } } = await supabaseLocal.auth.getSession();
    if (session?.access_token) {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (apiUrl) {
        const token = (await Notifications.default.getExpoPushTokenAsync()).data;
        if (token) {
          await fetch(`${apiUrl}/api/v1/notifications/unregister?token=${encodeURIComponent(token)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        }
      }
    }
  } catch (e) {
    console.warn("[Notifications] Token unregister skipped:", e);
  }

  // Sign out of Supabase
  const { supabase } = await import('./supabase');
  await supabase.auth.signOut();
  
  console.log('[STORAGE] User logged out and local data wiped successfully.');
}
