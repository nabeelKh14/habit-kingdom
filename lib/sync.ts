import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import * as storage from './storage';
import type { MutationEvent, MutationOp, MutationTable, RemoteRecord } from './storage';
import { FeatureFlag, isFeatureEnabled } from './feature-flags';

// =========================================================================
// STORAGE KEYS
// =========================================================================
const LAST_SYNC_KEY = 'habit_kingdom_last_sync';
const TABLE_CURSOR_KEY = 'habit_kingdom_sync_cursors_v1';
const MUTATION_QUEUE_KEY = 'habit_kingdom_sync_queue_v1';

const QUEUE_MAX_ATTEMPTS = 8;
const QUEUE_FLUSH_DEBOUNCE_MS = 750;
const REALTIME_TABLES: MutationTable[] = [
  'profiles', 'habits', 'rewards', 'completions',
  'redemptions', 'wallet', 'achievements', 'user_stats',
];

// =========================================================================
// PUBLIC TYPES
// =========================================================================
export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'unauthenticated'
  | 'disabled';

export interface SyncState {
  status: SyncStatus;
  lastSync: string | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
  pendingMutations: number;
  inflight: boolean;
  realtimeAttached: boolean;
  userId: string | null;
  error: string | null;
}

export interface QueuedMutation {
  /** Stable client id for the queue entry */
  queueId: string;
  table: MutationTable;
  op: MutationOp;
  /** Row primary key (or composite key) */
  id: string;
  /** Owning profile id, when known */
  profileId: string | null;
  /** Snake_case payload ready for upsert */
  payload: Record<string, any>;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

export type SyncListener = (state: SyncState) => void;

export interface SyncOptions {
  /** Override the userId to scope the sync to. Defaults to authenticated user. */
  userId?: string;
  /** Force a full sync ignoring deltas. */
  force?: boolean;
  /** Skip the offline-queue flush during this op. */
  skipQueueFlush?: boolean;
}

// =========================================================================
// INTERNAL STATE
// =========================================================================
let state: SyncState = {
  status: 'idle',
  lastSync: null,
  lastPullAt: null,
  lastPushAt: null,
  pendingMutations: 0,
  inflight: false,
  realtimeAttached: false,
  userId: null,
  error: null,
};

const listeners = new Set<SyncListener>();
let mutationUnsubscribe: (() => void) | null = null;
let authUnsubscribe: (() => void) | null = null;
let realtimeChannels: RealtimeChannel[] = [];
let queueFlushTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

// =========================================================================
// HELPERS
// =========================================================================
async function isSupabaseConfigured(): Promise<boolean> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && key);
}

function notify(): void {
  const snapshot = { ...state };
  listeners.forEach(fn => {
    try { fn(snapshot); } catch (err) { console.warn('[SYNC] listener error:', err); }
  });
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  notify();
}

function nowIso(): string {
  return new Date().toISOString();
}

function isAuthError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /jwt|token|unauthorized|401|403/i.test(msg);
}

function isNetworkError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /network|fetch|failed to fetch|timeout|offline|connection/i.test(msg);
}

/**
 * Get the current authenticated user id, if any. Returns null when there
 * is no session (anonymous app usage).
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch (err) {
    console.warn('[SYNC] getAuthenticatedUserId failed:', err);
    return null;
  }
}

export function getSyncState(): SyncState {
  return { ...state };
}

export async function getLastSyncTime(): Promise<string | null> {
  try {
    if (state.lastSync) return state.lastSync;
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export function addSyncListener(fn: SyncListener): () => void {
  listeners.add(fn);
  // Push current state immediately so subscribers don't miss it
  try { fn({ ...state }); } catch {}
  return () => listeners.delete(fn);
}

// =========================================================================
// PER-TABLE CURSORS (last successful pull updated_at per table)
// =========================================================================
type TableCursors = Partial<Record<MutationTable, string>>;

async function loadCursors(): Promise<TableCursors> {
  try {
    const raw = await AsyncStorage.getItem(TABLE_CURSOR_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveCursors(cursors: TableCursors): Promise<void> {
  try {
    await AsyncStorage.setItem(TABLE_CURSOR_KEY, JSON.stringify(cursors));
  } catch (err) {
    console.warn('[SYNC] saveCursors failed:', err);
  }
}

// =========================================================================
// MUTATION QUEUE (AsyncStorage-backed FIFO)
// =========================================================================
async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(MUTATION_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedMutation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
    setState({ pendingMutations: queue.length });
  } catch (err) {
    console.warn('[SYNC] writeQueue failed:', err);
  }
}

export async function getQueuedMutationCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function clearMutationQueue(): Promise<void> {
  await writeQueue([]);
}

/**
 * Push a mutation onto the offline queue. If multiple ops for the same
 * (table,id) are queued, the latest one wins (coalesced).
 */
export async function enqueueMutation(mutation: Omit<QueuedMutation, 'queueId' | 'queuedAt' | 'attempts' | 'lastError'>): Promise<void> {
  const queue = await readQueue();
  const filtered = queue.filter(q => !(q.table === mutation.table && q.id === mutation.id));
  filtered.push({
    ...mutation,
    queueId: `${mutation.table}:${mutation.id}:${Date.now()}`,
    queuedAt: nowIso(),
    attempts: 0,
    lastError: null,
  });
  await writeQueue(filtered);
}

function scheduleQueueFlush(): void {
  if (queueFlushTimer) clearTimeout(queueFlushTimer);
  queueFlushTimer = setTimeout(() => {
    queueFlushTimer = null;
    flushMutationQueue().catch(err => console.warn('[SYNC] auto-flush failed:', err));
  }, QUEUE_FLUSH_DEBOUNCE_MS);
}

// =========================================================================
// MUTATION EVENT -> QUEUE BRIDGE
// =========================================================================

/** Convert a local mutation event to the snake_case Supabase payload. */
function buildQueuePayload(event: MutationEvent): Record<string, any> {
  const r = event.record || {};
  switch (event.table) {
    case 'profiles':
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        created_at: r.createdAt ?? r.created_at,
      };
    case 'habits':
      return {
        id: r.id,
        name: r.name,
        icon: r.icon,
        coin_reward: r.coinReward,
        color: r.color,
        created_at: r.createdAt ?? r.created_at,
        frequency: r.frequency,
        scheduled_time: r.scheduledTime ?? null,
        days_of_week: r.daysOfWeek ? (typeof r.daysOfWeek === 'string' ? r.daysOfWeek : JSON.stringify(r.daysOfWeek)) : null,
        day_of_month: r.dayOfMonth ?? null,
        is_paused: r.isPaused ?? false,
        pause_until: r.pauseUntil ?? null,
        notifications_enabled: r.notificationsEnabled ?? false,
        notification_time: r.notificationTime ?? null,
        profile_id: r.profileId ?? event.profileId,
        deleted_at: r.deletedAt ?? null,
      };
    case 'rewards':
      return {
        id: r.id,
        name: r.name,
        icon: r.icon,
        cost: r.cost,
        color: r.color,
        created_at: r.createdAt ?? r.created_at,
        profile_id: r.profileId ?? event.profileId,
        deleted_at: r.deletedAt ?? null,
      };
    case 'completions':
      return {
        id: r.id,
        habit_id: r.habitId,
        habit_name: r.habitName,
        coin_reward: r.coinReward,
        completed_at: r.completedAt,
        profile_id: r.profileId ?? event.profileId,
      };
    case 'redemptions':
      return {
        id: r.id,
        reward_id: r.rewardId,
        reward_name: r.rewardName,
        cost: r.cost,
        redeemed_at: r.redeemedAt,
        profile_id: r.profileId ?? event.profileId,
      };
    case 'wallet':
      return {
        profile_id: r.profileId ?? event.profileId,
        balance: r.balance ?? 0,
      };
    case 'achievements':
      return {
        id: r.id,
        trophy_id: r.trophyId,
        unlocked_at: r.unlockedAt,
        profile_id: r.profileId ?? event.profileId,
      };
    case 'user_stats':
      return {
        profile_id: r.profileId ?? event.profileId,
        total_completions: r.totalCompletions ?? 0,
        longest_streak: r.longestStreak ?? 0,
        longest_single_habit_streak: r.longestSingleHabitStreak ?? 0,
        longest_single_habit_id: r.longestSingleHabitId ?? null,
      };
    case 'purchased_skills':
      return {
        id: r.id,
        skill_id: r.skillId,
        profile_id: r.profileId ?? event.profileId,
        purchased_at: r.purchasedAt,
      };
    default:
      return r;
  }
}

async function handleLocalMutation(event: MutationEvent): Promise<void> {
  // Never re-push something that came from the cloud
  if (event.fromRemote) return;
  if (!(await isSupabaseConfigured())) return;
  await enqueueMutation({
    table: event.table,
    op: event.op,
    id: event.id,
    profileId: event.profileId ?? null,
    payload: buildQueuePayload(event),
  });
  scheduleQueueFlush();
}

// =========================================================================
// FLUSH (push queued mutations to Supabase)
// =========================================================================
export async function flushMutationQueue(opts: SyncOptions = {}): Promise<{ success: boolean; flushed: number; remaining: number; error?: string }> {
  if (!(await isSupabaseConfigured())) {
    return { success: false, flushed: 0, remaining: 0, error: 'Supabase not configured' };
  }
  const userId = opts.userId ?? (await getAuthenticatedUserId());
  if (!userId) {
    setState({ status: 'unauthenticated' });
    return { success: false, flushed: 0, remaining: 0, error: 'Not authenticated' };
  }

  let queue = await readQueue();
  if (queue.length === 0) return { success: true, flushed: 0, remaining: 0 };

  let flushed = 0;
  const survivors: QueuedMutation[] = [];

  for (const item of queue) {
    try {
      if (item.op === 'delete') {
        const tablePk = item.table === 'wallet' || item.table === 'user_stats' ? 'profile_id' : 'id';
        const { error } = await supabase.from(item.table).delete().eq(tablePk, item.id);
        if (error) throw error;
      } else {
        const onConflict = item.table === 'wallet' || item.table === 'user_stats' ? 'profile_id' : 'id';
        const { error } = await supabase.from(item.table).upsert(item.payload, { onConflict });
        if (error) throw error;
      }
      flushed++;
    } catch (err: any) {
      const attempts = item.attempts + 1;
      const lastError = String(err?.message || err);
      if (isAuthError(err)) {
        // Stop the flush — we need re-auth
        survivors.push({ ...item, attempts, lastError });
        survivors.push(...queue.slice(queue.indexOf(item) + 1));
        await writeQueue(survivors);
        setState({ status: 'unauthenticated', error: lastError });
        return { success: false, flushed, remaining: survivors.length, error: lastError };
      }
      if (isNetworkError(err)) {
        // Keep the rest of the queue intact for next attempt
        survivors.push({ ...item, attempts, lastError });
        survivors.push(...queue.slice(queue.indexOf(item) + 1));
        await writeQueue(survivors);
        setState({ status: 'offline', error: lastError });
        return { success: false, flushed, remaining: survivors.length, error: lastError };
      }
      if (attempts >= QUEUE_MAX_ATTEMPTS) {
        console.warn(`[SYNC] dropping mutation after ${attempts} attempts:`, item, err);
      } else {
        survivors.push({ ...item, attempts, lastError });
      }
    }
  }

  await writeQueue(survivors);
  setState({ lastPushAt: nowIso(), error: null });
  return { success: true, flushed, remaining: survivors.length };
}

// =========================================================================
// PULL (Supabase -> local). Uses per-table delta cursor.
// =========================================================================
export async function pullFromSupabase(opts: SyncOptions = {}): Promise<{ success: boolean; pulled: number; message: string }> {
  if (!(await isSupabaseConfigured())) {
    return { success: false, pulled: 0, message: 'Supabase not configured' };
  }
  const userId = opts.userId ?? (await getAuthenticatedUserId());
  if (!userId) {
    setState({ status: 'unauthenticated' });
    return { success: false, pulled: 0, message: 'Not authenticated' };
  }

  const cursors = await loadCursors();
  const newCursors: TableCursors = { ...cursors };
  let pulled = 0;

  // 1) profile row (single)
  try {
    const since = opts.force ? null : cursors.profiles;
    let q = supabase.from('profiles').select('*').eq('id', userId);
    if (since) q = q.gt('updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    if (data) {
      for (const row of data) {
        await storage.applyRemoteUpsert({ table: 'profiles', id: row.id, profileId: row.id, data: row });
        pulled++;
        if (row.updated_at && (!newCursors.profiles || row.updated_at > newCursors.profiles)) {
          newCursors.profiles = row.updated_at;
        }
      }
    }
  } catch (err: any) {
    return handlePullError(err, pulled);
  }

  // 2) per-profile collections — RLS already constrains to auth.uid(), but we filter explicitly for clarity
  const collections: { table: MutationTable; idField: string; pk: string }[] = [
    { table: 'habits',      idField: 'profile_id', pk: 'id' },
    { table: 'rewards',     idField: 'profile_id', pk: 'id' },
    { table: 'completions', idField: 'profile_id', pk: 'id' },
    { table: 'redemptions', idField: 'profile_id', pk: 'id' },
    { table: 'achievements',idField: 'profile_id', pk: 'id' },
  ];

  for (const { table, idField, pk } of collections) {
    try {
      const since = opts.force ? null : cursors[table];
      let q = supabase.from(table).select('*').eq(idField, userId);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data ?? []) {
        const id = String(row[pk]);
        // Treat soft-deleted rows (deleted_at set) as deletes locally
        if (row.deleted_at) {
          await storage.applyRemoteDelete({ table, id, profileId: row[idField], data: row });
        } else {
          await storage.applyRemoteUpsert({ table, id, profileId: row[idField], data: row });
        }
        pulled++;
        if (row.updated_at && (!newCursors[table] || row.updated_at > newCursors[table]!)) {
          newCursors[table] = row.updated_at;
        }
      }
    } catch (err: any) {
      return handlePullError(err, pulled);
    }
  }

  // 3) singletons: wallet & user_stats keyed by profile_id
  for (const table of ['wallet', 'user_stats'] as MutationTable[]) {
    try {
      const since = opts.force ? null : cursors[table];
      let q = supabase.from(table).select('*').eq('profile_id', userId);
      if (since) q = q.gt('updated_at', since);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data ?? []) {
        await storage.applyRemoteUpsert({ table, id: row.profile_id, profileId: row.profile_id, data: row });
        pulled++;
        if (row.updated_at && (!newCursors[table] || row.updated_at > newCursors[table]!)) {
          newCursors[table] = row.updated_at;
        }
      }
    } catch (err: any) {
      return handlePullError(err, pulled);
    }
  }

  await saveCursors(newCursors);
  setState({ lastPullAt: nowIso(), error: null });
  return { success: true, pulled, message: `Pulled ${pulled} record(s) from Supabase` };
}

function handlePullError(err: any, pulled: number): { success: boolean; pulled: number; message: string } {
  const msg = String(err?.message || err);
  console.error('[SYNC] pull error:', msg);
  if (isAuthError(err)) {
    setState({ status: 'unauthenticated', error: msg });
  } else if (isNetworkError(err)) {
    setState({ status: 'offline', error: msg });
  } else {
    setState({ status: 'error', error: msg });
  }
  return { success: false, pulled, message: msg };
}

// =========================================================================
// PUSH (local -> Supabase). Pushes everything currently known locally.
// =========================================================================
export async function pushToSupabase(opts: SyncOptions = {}): Promise<{ success: boolean; pushed: number; message: string }> {
  if (!(await isSupabaseConfigured())) {
    return { success: false, pushed: 0, message: 'Supabase not configured' };
  }
  const userId = opts.userId ?? (await getAuthenticatedUserId());
  if (!userId) {
    setState({ status: 'unauthenticated' });
    return { success: false, pushed: 0, message: 'Not authenticated' };
  }

  let pushed = 0;
  try {
    const profiles = await storage.getProfiles();
    // We only push the row owned by the authenticated user (RLS enforces this too)
    const ownProfile = profiles.find(p => p.id === userId) ?? profiles[0];
    if (!ownProfile) {
      return { success: true, pushed: 0, message: 'No profiles to push' };
    }

    // Profile
    {
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        name: ownProfile.name,
        type: ownProfile.type,
        created_at: ownProfile.createdAt,
      }, { onConflict: 'id' });
      if (error) throw error;
      pushed++;
    }

    // Habits (use storage to scope to active profile — switch context if needed)
    const previousActiveId = storage.getActiveProfileId();
    if (previousActiveId !== userId) storage.setActiveProfileId(userId);
    try {
      const habits = await storage.getHabits();
      if (habits.length > 0) {
        const rows = habits.map(h => ({
          id: h.id, name: h.name, icon: h.icon, coin_reward: h.coinReward, color: h.color,
          created_at: h.createdAt, frequency: h.frequency,
          scheduled_time: h.scheduledTime ?? null,
          days_of_week: h.daysOfWeek ? JSON.stringify(h.daysOfWeek) : null,
          day_of_month: h.dayOfMonth ?? null,
          is_paused: h.isPaused ?? false,
          pause_until: h.pauseUntil ?? null,
          notifications_enabled: h.notificationsEnabled ?? false,
          notification_time: h.notificationTime ?? null,
          profile_id: userId,
          deleted_at: null,
        }));
        const { error } = await supabase.from('habits').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        pushed += rows.length;
      }

      const rewards = await storage.getRewards();
      if (rewards.length > 0) {
        const rows = rewards.map(r => ({
          id: r.id, name: r.name, icon: r.icon, cost: r.cost, color: r.color,
          created_at: r.createdAt, profile_id: userId, deleted_at: null,
        }));
        const { error } = await supabase.from('rewards').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        pushed += rows.length;
      }

      const completions = await storage.getCompletions(userId);
      if (completions.length > 0) {
        const rows = completions.map(c => ({
          id: c.id, habit_id: c.habitId, habit_name: c.habitName,
          coin_reward: c.coinReward, completed_at: c.completedAt, profile_id: userId,
        }));
        const { error } = await supabase.from('completions').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        pushed += rows.length;
      }

      const redemptions = await storage.getRedemptions(userId);
      if (redemptions.length > 0) {
        const rows = redemptions.map(r => ({
          id: r.id, reward_id: r.rewardId, reward_name: r.rewardName,
          cost: r.cost, redeemed_at: r.redeemedAt, profile_id: userId,
        }));
        const { error } = await supabase.from('redemptions').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        pushed += rows.length;
      }

      const balance = await storage.getBalance(userId);
      {
        const { error } = await supabase.from('wallet').upsert(
          { profile_id: userId, balance },
          { onConflict: 'profile_id' },
        );
        if (error) throw error;
        pushed++;
      }

      const achievements = await storage.getUnlockedAchievements();
      if (achievements.length > 0) {
        const rows = achievements.map(a => ({
          id: a.id, trophy_id: a.trophyId, unlocked_at: a.unlockedAt, profile_id: userId,
        }));
        const { error } = await supabase.from('achievements').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        pushed += rows.length;
      }

      const stats = await storage.getUserStats(userId);
      {
        const { error } = await supabase.from('user_stats').upsert({
          profile_id: userId,
          total_completions: stats.totalCompletions,
          longest_streak: stats.longestStreak,
          longest_single_habit_streak: stats.longestSingleHabitStreak,
          longest_single_habit_id: stats.longestSingleHabitId ?? null,
        }, { onConflict: 'profile_id' });
        if (error) throw error;
        pushed++;
      }
    } finally {
      if (previousActiveId !== userId) storage.setActiveProfileId(previousActiveId);
    }

    setState({ lastPushAt: nowIso(), error: null });
    return { success: true, pushed, message: `Pushed ${pushed} record(s) to Supabase` };
  } catch (err: any) {
    const msg = String(err?.message || err);
    console.error('[SYNC] push error:', msg);
    if (isAuthError(err)) setState({ status: 'unauthenticated', error: msg });
    else if (isNetworkError(err)) setState({ status: 'offline', error: msg });
    else setState({ status: 'error', error: msg });
    return { success: false, pushed, message: msg };
  }
}

// =========================================================================
// FULL SYNC (bidirectional). Flush queue -> push -> pull.
// =========================================================================
export async function fullSync(opts: SyncOptions = {}): Promise<{ success: boolean; message: string; pushed?: number; pulled?: number; flushed?: number }> {
  if (state.inflight) {
    return { success: false, message: 'Sync already in progress' };
  }
  if (!(await isSupabaseConfigured())) {
    setState({ status: 'disabled' });
    return { success: false, message: 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.' };
  }

  const userId = opts.userId ?? (await getAuthenticatedUserId());
  if (!userId) {
    setState({ status: 'unauthenticated' });
    return { success: false, message: 'Not authenticated — please sign in.' };
  }

  setState({ inflight: true, status: 'syncing', userId, error: null });
  let flushed = 0, pushed = 0, pulled = 0;

  try {
    // 1) Drain queued offline mutations first
    if (!opts.skipQueueFlush) {
      const flushRes = await flushMutationQueue({ userId });
      flushed = flushRes.flushed;
      if (!flushRes.success && flushRes.error) {
        // Don't abort the whole sync — pull can still succeed.
        console.warn('[SYNC] queue flush warning:', flushRes.error);
      }
    }

    // 2) Bulk push current snapshot (idempotent upsert; safe to repeat)
    const pushRes = await pushToSupabase({ userId });
    pushed = pushRes.pushed;
    if (!pushRes.success) {
      setState({ inflight: false });
      return { success: false, message: pushRes.message, pushed, pulled, flushed };
    }

    // 3) Pull deltas back down
    const pullRes = await pullFromSupabase({ userId, force: opts.force });
    pulled = pullRes.pulled;
    if (!pullRes.success) {
      setState({ inflight: false });
      return { success: false, message: pullRes.message, pushed, pulled, flushed };
    }

    const lastSync = nowIso();
    await AsyncStorage.setItem(LAST_SYNC_KEY, lastSync);
    setState({ inflight: false, status: 'idle', lastSync, error: null });
    return {
      success: true,
      pushed, pulled, flushed,
      message: `Synced ${pushed} pushed, ${pulled} pulled, ${flushed} flushed at ${new Date(lastSync).toLocaleTimeString()}`,
    };
  } catch (err: any) {
    const msg = String(err?.message || err);
    console.error('[SYNC] fullSync error:', msg);
    if (isAuthError(err)) setState({ inflight: false, status: 'unauthenticated', error: msg });
    else if (isNetworkError(err)) setState({ inflight: false, status: 'offline', error: msg });
    else setState({ inflight: false, status: 'error', error: msg });
    return { success: false, message: msg, pushed, pulled, flushed };
  }
}

// =========================================================================
// REALTIME SUBSCRIPTIONS
// =========================================================================
async function applyRealtimePayload(table: MutationTable, payload: any): Promise<void> {
  try {
    const eventType: 'INSERT' | 'UPDATE' | 'DELETE' = payload.eventType;
    const row = payload.new ?? payload.old;
    if (!row) return;
    const pkField = table === 'wallet' || table === 'user_stats' ? 'profile_id' : 'id';
    const id = String(row[pkField]);
    const profileId = row.profile_id ?? row.id ?? null;
    const rec: RemoteRecord = { table, id, profileId, data: row };
    if (eventType === 'DELETE') {
      await storage.applyRemoteDelete(rec);
    } else {
      await storage.applyRemoteUpsert(rec);
    }
  } catch (err) {
    console.warn(`[SYNC] realtime apply failed for ${table}:`, err);
  }
}

export async function subscribeToRealtime(opts: SyncOptions = {}): Promise<boolean> {
  if (!(await isSupabaseConfigured())) return false;
  const userId = opts.userId ?? (await getAuthenticatedUserId());
  if (!userId) return false;

  // Tear down any existing channels first
  await unsubscribeFromRealtime();

  for (const table of REALTIME_TABLES) {
    const filterField = table === 'profiles' ? 'id' : 'profile_id';
    const channel = supabase
      .channel(`hk:${table}:${userId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, filter: `${filterField}=eq.${userId}` },
        (payload: any) => { applyRealtimePayload(table, payload); },
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[SYNC] realtime channel ${table} status:`, status);
        }
      });
    realtimeChannels.push(channel);
  }

  setState({ realtimeAttached: true });
  return true;
}

export async function unsubscribeFromRealtime(): Promise<void> {
  for (const ch of realtimeChannels) {
    try { await supabase.removeChannel(ch); } catch {}
  }
  realtimeChannels = [];
  setState({ realtimeAttached: false });
}

// =========================================================================
// LIFECYCLE
// =========================================================================

/**
 * Initialize the sync subsystem. Idempotent. Call once on app boot after
 * the user is authenticated (or anywhere — it will no-op without a session).
 */
export async function initializeSync(opts: SyncOptions = {}): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!(await isSupabaseConfigured())) {
    setState({ status: 'disabled' });
    return;
  }

  // Restore last sync timestamp
  try {
    const last = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (last) setState({ lastSync: last });
  } catch {}

  // Restore queue counter
  const queueLen = (await readQueue()).length;
  setState({ pendingMutations: queueLen });

  // Subscribe to local mutations -> push to queue
  if (mutationUnsubscribe) mutationUnsubscribe();
  mutationUnsubscribe = storage.onMutation((event) => {
    handleLocalMutation(event).catch(err => console.warn('[SYNC] handleLocalMutation:', err));
  });

  // Auth state changes — reattach realtime + run sync on sign-in, tear down on sign-out
  if (authUnsubscribe) authUnsubscribe();
  const { data: authSub } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      const uid = session?.user?.id ?? null;
      setState({ userId: uid });
      if (uid) {
        await subscribeToRealtime({ userId: uid });
        fullSync({ userId: uid }).catch(err => console.warn('[SYNC] onAuth sync:', err));
      }
    } else if (event === 'SIGNED_OUT') {
      setState({ userId: null, status: 'unauthenticated' });
      await unsubscribeFromRealtime();
      await clearMutationQueue();
    }
  });
  authUnsubscribe = () => { try { authSub.subscription.unsubscribe(); } catch {} };

  // If we already have a session, kick things off
  const userId = opts.userId ?? (await getAuthenticatedUserId());
  setState({ userId, status: userId ? 'idle' : 'unauthenticated' });
  if (userId) {
    await subscribeToRealtime({ userId });
    // Drain any queued mutations from previous session
    flushMutationQueue({ userId }).catch(err => console.warn('[SYNC] init flush:', err));
  }
}

/**
 * Tear down listeners, channels, and timers. Safe to call multiple times.
 */
export async function shutdownSync(): Promise<void> {
  if (!initialized) return;
  initialized = false;
  if (mutationUnsubscribe) { mutationUnsubscribe(); mutationUnsubscribe = null; }
  if (authUnsubscribe) { authUnsubscribe(); authUnsubscribe = null; }
  if (queueFlushTimer) { clearTimeout(queueFlushTimer); queueFlushTimer = null; }
  await unsubscribeFromRealtime();
  setState({ status: 'idle', inflight: false, realtimeAttached: false });
}

// =========================================================================
// BACKWARDS-COMPAT WRAPPER
// =========================================================================

/**
 * Legacy wrapper used by settings.tsx and _layout.tsx — runs a full
 * bidirectional sync and returns the same shape the old impl did.
 */
export async function syncWithSupabase(force = false): Promise<{ success: boolean; message: string }> {
  if (!isFeatureEnabled(FeatureFlag.CLOUD_SYNC)) {
    return { success: false, message: "Cloud sync disabled by feature flag" };
  }
  const res = await fullSync({ force });
  return { success: res.success, message: res.message };
}
