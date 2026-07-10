import * as storage from './storage';
import { getServerToken } from './server-auth';

// =========================================================================
// SERVER SYNC (Express REST <-> local SQLite)
// -------------------------------------------------------------------------
// Replaces the old direct-Supabase sync. The Express server is now the
// authoritative store; this module pushes the local snapshot up and pulls
// the server's authoritative dataset back down, reconciling into SQLite.
// =========================================================================

function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw) return 'https://api.habitkingdom.app';
  return raw.replace(/\/$/, '');
}

function isAuthError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /jwt|token|unauthorized|401|403/i.test(msg);
}

function isNetworkError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return /network|fetch|failed to fetch|timeout|offline|connection|ENOTFOUND|ECONNREFUSED/i.test(msg);
}

/**
 * PUSH: upload the local snapshot for `profileId` to the server's
 * /api/v1/sync/upload endpoint. The server upserts everything keyed on the
 * app profile id, so this is idempotent and safe to call repeatedly.
 */
export async function pushToServer(profileId: string): Promise<{ success: boolean; pushed: number; message: string }> {
  const token = await getServerToken(profileId);
  if (!token) {
    return { success: false, pushed: 0, message: 'No server session (offline or not configured)' };
  }

  try {
    const previousActiveId = storage.getActiveProfileId();
    if (previousActiveId !== profileId) storage.setActiveProfileId(profileId);

    let pushed = 0;
    const payload: Record<string, any> = { habits: [], rewards: [], completions: [], redemptions: [], achievements: [], wallet: null, stats: null };

    try {
      const habits = await storage.getHabits();
      payload.habits = habits.map((h: any) => ({
        id: h.id, name: h.name, icon: h.icon, coinReward: h.coinReward, color: h.color,
        created_at: h.createdAt, frequency: h.frequency,
        scheduled_time: h.scheduledTime ?? null,
        days_of_week: h.daysOfWeek ? (typeof h.daysOfWeek === 'string' ? h.daysOfWeek : JSON.stringify(h.daysOfWeek)) : null,
        day_of_month: h.dayOfMonth ?? null,
        is_paused: h.isPaused ?? false, pause_until: h.pauseUntil ?? null,
        notifications_enabled: h.notificationsEnabled ?? false, notification_time: h.notificationTime ?? null,
        profile_id: profileId, deleted_at: null,
      }));
      pushed += payload.habits.length;

      const rewards = await storage.getRewards();
      payload.rewards = rewards.map((r: any) => ({
        id: r.id, name: r.name, icon: r.icon, cost: r.cost, color: r.color,
        created_at: r.createdAt, profile_id: profileId, deleted_at: null,
      }));
      pushed += payload.rewards.length;

      const completions = await storage.getCompletions(profileId);
      payload.completions = completions.map((c: any) => ({
        id: c.id, habit_id: c.habitId, habit_name: c.habitName, coin_reward: c.coinReward,
        completed_at: c.completedAt, profile_id: profileId,
      }));
      pushed += payload.completions.length;

      const redemptions = await storage.getRedemptions(profileId);
      payload.redemptions = redemptions.map((r: any) => ({
        id: r.id, reward_id: r.rewardId, reward_name: r.rewardName, cost: r.cost,
        redeemed_at: r.redeemedAt, profile_id: profileId,
      }));
      pushed += payload.redemptions.length;

      const balance = await storage.getBalance(profileId);
      payload.wallet = { profile_id: profileId, balance };

      const achievements = await storage.getUnlockedAchievements();
      payload.achievements = achievements.map((a: any) => ({
        id: a.id, trophy_id: a.trophyId, unlocked_at: a.unlockedAt, profile_id: profileId,
      }));
      pushed += payload.achievements.length;

      const stats = await storage.getUserStats(profileId);
      payload.stats = {
        profile_id: profileId,
        total_completions: stats.totalCompletions,
        longest_streak: stats.longestStreak,
        longest_single_habit_streak: stats.longestSingleHabitStreak,
        longest_single_habit_id: stats.longestSingleHabitId ?? null,
      };
    } finally {
      if (previousActiveId !== profileId) storage.setActiveProfileId(previousActiveId);
    }

    const res = await fetch(`${apiBaseUrl()}/api/v1/sync/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      const msg = `${res.status}: ${text}`;
      if (isAuthError({ message: msg })) {
        // Token rejected — clear and let next sync re-auth.
        const { clearServerSession } = await import('./server-auth');
        await clearServerSession(profileId);
      }
      return { success: false, pushed, message: msg };
    }

    return { success: true, pushed, message: `Pushed ${pushed} record(s) to server` };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (isNetworkError(err)) return { success: false, pushed: 0, message: 'Offline — will retry' };
    return { success: false, pushed: 0, message: msg };
  }
}

/**
 * PULL: download the server's authoritative dataset for `profileId` and
 * reconcile it into the local SQLite cache (without re-pushing).
 */
export async function pullFromServer(profileId: string): Promise<{ success: boolean; pulled: number; message: string }> {
  const token = await getServerToken(profileId);
  if (!token) {
    return { success: false, pulled: 0, message: 'No server session (offline or not configured)' };
  }

  try {
    const res = await fetch(`${apiBaseUrl()}/api/v1/sync/download`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      const msg = `${res.status}: ${text}`;
      if (isAuthError({ message: msg })) {
        const { clearServerSession } = await import('./server-auth');
        await clearServerSession(profileId);
      }
      return { success: false, pulled: 0, message: msg };
    }

    const data = await res.json();
    let pulled = 0;

    const upsert = async (table: any, rows: any[] | undefined) => {
      for (const row of rows ?? []) {
        const id = String(row.id ?? row.profile_id);
        await storage.applyRemoteUpsert({ table, id, profileId: row.profile_id ?? profileId, data: row });
        pulled++;
      }
    };

    await upsert('habits', data.habits);
    await upsert('rewards', data.rewards);
    await upsert('completions', data.completions);
    await upsert('redemptions', data.redemptions);
    await upsert('achievements', data.achievements);
    if (data.wallet) {
      await storage.applyRemoteUpsert({ table: 'wallet', id: profileId, profileId, data: data.wallet });
      pulled++;
    }
    if (data.stats) {
      await storage.applyRemoteUpsert({ table: 'user_stats', id: profileId, profileId, data: data.stats });
      pulled++;
    }

    return { success: true, pulled, message: `Pulled ${pulled} record(s) from server` };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (isNetworkError(err)) return { success: false, pulled: 0, message: 'Offline — will retry' };
    return { success: false, pulled: 0, message: msg };
  }
}
