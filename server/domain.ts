import { randomUUID } from "crypto";
import { pool } from "./db";

// Domain entities persisted server-side, keyed on server_users.id (profileId).
// Mirrors shared/schema.ts column shapes. All methods accept a profileId and
// enforce that callers only touch their own (or a linked child's) data — the
// route layer passes the authenticated user id and checks family_links.

export interface HabitRow {
  id: string;
  name: string;
  icon: string;
  coinReward: number;
  color: string;
  createdAt: string;
  frequency: "once" | "daily" | "weekly" | "monthly";
  scheduledTime?: string | null;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  isPaused: boolean;
  pauseUntil?: string | null;
  notificationsEnabled: boolean;
  notificationTime?: string | null;
  profileId: string;
  deletedAt?: string | null;
}

export interface RewardRow {
  id: string;
  name: string;
  icon: string;
  cost: number;
  color: string;
  createdAt: string;
  profileId: string;
  deletedAt?: string | null;
}

export interface CompletionRow {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
  profileId: string;
}

export interface RedemptionRow {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
  profileId: string;
}

export interface UserStatsRow {
  profileId: string;
  totalCompletions: number;
  longestStreak: number;
  longestSingleHabitStreak: number;
  longestSingleHabitId: string | null;
}

// In-memory fallback store (used when SUPABASE_DB_URL is absent)
class MemStore {
  habits = new Map<string, HabitRow>();
  rewards = new Map<string, RewardRow>();
  completions = new Map<string, CompletionRow>();
  redemptions = new Map<string, RedemptionRow>();
  wallets = new Map<string, number>(); // profileId -> balance
  stats = new Map<string, UserStatsRow>();
  achievements = new Map<string, { id: string; trophyId: string; unlockedAt: string; profileId: string }>();
  purchasedSkills = new Map<string, { id: string; skillId: string; profileId: string }>();

  ensure(profileId: string) {
    if (!this.wallets.has(profileId)) this.wallets.set(profileId, 0);
    if (!this.stats.has(profileId)) {
      this.stats.set(profileId, {
        profileId,
        totalCompletions: 0,
        longestStreak: 0,
        longestSingleHabitStreak: 0,
        longestSingleHabitId: null,
      });
    }
  }
}

export class DomainStore {
  private mem = new MemStore();

  private habitFromRow(r: any): HabitRow {
    return {
      id: r.id,
      name: r.name,
      icon: r.icon,
      coinReward: r.coin_reward,
      color: r.color,
      createdAt: new Date(r.created_at).toISOString(),
      frequency: r.frequency,
      scheduledTime: r.scheduled_time ?? null,
      daysOfWeek: r.days_of_week ? JSON.parse(r.days_of_week) : null,
      dayOfMonth: r.day_of_month ?? null,
      isPaused: r.is_paused ?? false,
      pauseUntil: r.pause_until ?? null,
      notificationsEnabled: r.notifications_enabled ?? false,
      notificationTime: r.notification_time ?? null,
      profileId: r.profile_id,
      deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
    };
  }

  private rewardFromRow(r: any): RewardRow {
    return {
      id: r.id,
      name: r.name,
      icon: r.icon,
      cost: r.cost,
      color: r.color,
      createdAt: new Date(r.created_at).toISOString(),
      profileId: r.profile_id,
      deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
    };
  }

  // ─────────────── HABITS ───────────────
  async getHabits(profileId: string): Promise<HabitRow[]> {
    if (pool) {
      const { rows } = await pool.query(
        "SELECT * FROM server_habits WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY created_at",
        [profileId]
      );
      return rows.map((r) => this.habitFromRow(r));
    }
    return Array.from(this.mem.habits.values()).filter((h) => h.profileId === profileId && !h.deletedAt);
  }

  async getHabit(id: string): Promise<HabitRow | undefined> {
    if (pool) {
      const { rows } = await pool.query("SELECT * FROM server_habits WHERE id = $1", [id]);
      return rows[0] ? this.habitFromRow(rows[0]) : undefined;
    }
    return this.mem.habits.get(id);
  }

  async createHabit(input: Omit<HabitRow, "createdAt" | "deletedAt">): Promise<HabitRow> {
    const row: HabitRow = { ...input, createdAt: new Date().toISOString(), deletedAt: null };
    if (pool) {
      await pool.query(
        `INSERT INTO server_habits (id,name,icon,coin_reward,color,created_at,frequency,scheduled_time,days_of_week,day_of_month,is_paused,pause_until,notifications_enabled,notification_time,profile_id)
         VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,icon=EXCLUDED.icon,coin_reward=EXCLUDED.coin_reward,color=EXCLUDED.color,frequency=EXCLUDED.frequency,scheduled_time=EXCLUDED.scheduled_time,days_of_week=EXCLUDED.days_of_week,day_of_month=EXCLUDED.day_of_month,is_paused=EXCLUDED.is_paused,pause_until=EXCLUDED.pause_until,notifications_enabled=EXCLUDED.notifications_enabled,notification_time=EXCLUDED.notification_time,profile_id=EXCLUDED.profile_id,deleted_at=NULL`,
        [
          row.id, row.name, row.icon, row.coinReward, row.color, row.frequency,
          row.scheduledTime ?? null, row.daysOfWeek ? JSON.stringify(row.daysOfWeek) : null,
          row.dayOfMonth ?? null, row.isPaused, row.pauseUntil ?? null,
          row.notificationsEnabled, row.notificationTime ?? null, row.profileId,
        ]
      );
      return row;
    }
    this.mem.habits.set(row.id, row);
    return row;
  }

  async updateHabit(id: string, patch: Partial<HabitRow>): Promise<HabitRow | undefined> {
    const existing = await this.getHabit(id);
    if (!existing) return undefined;
    const merged = { ...existing, ...patch, id };
    if (pool) {
      await pool.query(
        `UPDATE server_habits SET name=$2,icon=$3,coin_reward=$4,color=$5,frequency=$6,scheduled_time=$7,days_of_week=$8,day_of_month=$9,is_paused=$10,pause_until=$11,notifications_enabled=$12,notification_time=$13 WHERE id=$1`,
        [
          id, merged.name, merged.icon, merged.coinReward, merged.color, merged.frequency,
          merged.scheduledTime ?? null, merged.daysOfWeek ? JSON.stringify(merged.daysOfWeek) : null,
          merged.dayOfMonth ?? null, merged.isPaused, merged.pauseUntil ?? null,
          merged.notificationsEnabled, merged.notificationTime ?? null,
        ]
      );
    } else {
      this.mem.habits.set(id, merged);
    }
    return merged;
  }

  async deleteHabit(id: string): Promise<void> {
    if (pool) {
      await pool.query("UPDATE server_habits SET deleted_at = now() WHERE id = $1", [id]);
    } else {
      const h = this.mem.habits.get(id);
      if (h) this.mem.habits.set(id, { ...h, deletedAt: new Date().toISOString() });
    }
  }

  // ─────────────── REWARDS ───────────────
  async getRewards(profileId: string): Promise<RewardRow[]> {
    if (pool) {
      const { rows } = await pool.query(
        "SELECT * FROM server_rewards WHERE profile_id = $1 AND deleted_at IS NULL ORDER BY created_at",
        [profileId]
      );
      return rows.map((r) => this.rewardFromRow(r));
    }
    return Array.from(this.mem.rewards.values()).filter((r) => r.profileId === profileId && !r.deletedAt);
  }

  async createReward(input: Omit<RewardRow, "createdAt" | "deletedAt">): Promise<RewardRow> {
    const row: RewardRow = { ...input, createdAt: new Date().toISOString(), deletedAt: null };
    if (pool) {
      await pool.query(
        `INSERT INTO server_rewards (id,name,icon,cost,color,created_at,profile_id)
         VALUES ($1,$2,$3,$4,$5,now(),$6)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,icon=EXCLUDED.icon,cost=EXCLUDED.cost,color=EXCLUDED.color,profile_id=EXCLUDED.profile_id,deleted_at=NULL`,
        [row.id, row.name, row.icon, row.cost, row.color, row.profileId]
      );
    } else {
      this.mem.rewards.set(row.id, row);
    }
    return row;
  }

  async deleteReward(id: string): Promise<void> {
    if (pool) await pool.query("UPDATE server_rewards SET deleted_at = now() WHERE id = $1", [id]);
    else {
      const r = this.mem.rewards.get(id);
      if (r) this.mem.rewards.set(id, { ...r, deletedAt: new Date().toISOString() });
    }
  }

  // ─────────────── COMPLETIONS (awards coins + updates stats atomically) ───────────────
  async completeHabit(input: {
    id: string;
    habitId: string;
    habitName: string;
    coinReward: number;
    profileId: string;
    completedAt?: string;
  }): Promise<{ completion: CompletionRow; newBalance: number; stats: UserStatsRow }> {
    const completedAt = input.completedAt ?? new Date().toISOString();
    const completion: CompletionRow = {
      id: input.id,
      habitId: input.habitId,
      habitName: input.habitName,
      coinReward: input.coinReward,
      completedAt,
      profileId: input.profileId,
    };

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO server_completions (id,habit_id,habit_name,coin_reward,completed_at,profile_id) VALUES ($1,$2,$3,$4,$5,$6)",
          [completion.id, completion.habitId, completion.habitName, completion.coinReward, completedAt, completion.profileId]
        );
        await client.query("SELECT 1 FROM server_wallet WHERE profile_id=$1 FOR UPDATE", [completion.profileId]);
        await this.ensureWallet(completion.profileId);
        await client.query("INSERT INTO server_wallet (profile_id,balance) VALUES ($1,$2) ON CONFLICT (profile_id) DO UPDATE SET balance = server_wallet.balance + $2", [completion.profileId, completion.coinReward]);
        // stats: increment total + single-habit streak
        const { rows: cur } = await client.query(
          "INSERT INTO server_user_stats (profile_id,total_completions,longest_single_habit_streak,longest_single_habit_id) VALUES ($1,1,0,NULL) ON CONFLICT (profile_id) DO UPDATE SET total_completions = server_user_stats.total_completions + 1 RETURNING *",
          [completion.profileId]
        );
        // simple single-habit streak: count completions of this habit today vs previous day
        const { rows: streakRows } = await client.query(
          "SELECT COUNT(*)::int AS cnt FROM server_completions WHERE habit_id=$1 AND profile_id=$2 AND completed_at >= now() - interval '2 days'",
          [completion.habitId, completion.profileId]
        );
        const streak = streakRows[0]?.cnt ?? 1;
        await client.query(
          "UPDATE server_user_stats SET longest_single_habit_streak = GREATEST(longest_single_habit_streak, $2), longest_single_habit_id = CASE WHEN $2 > longest_single_habit_streak THEN $3 ELSE longest_single_habit_id END WHERE profile_id=$1",
          [completion.profileId, streak, completion.habitId]
        );
        const { rows: bal } = await client.query("SELECT balance FROM server_wallet WHERE profile_id=$1", [completion.profileId]);
        const { rows: stats } = await client.query("SELECT * FROM server_user_stats WHERE profile_id=$1", [completion.profileId]);
        await client.query("COMMIT");
        return { completion, newBalance: bal[0].balance, stats: this.statsFromRow(stats[0]) };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }

    // in-memory fallback
    this.mem.ensure(completion.profileId);
    this.mem.completions.set(completion.id, completion);
    const nb = (this.mem.wallets.get(completion.profileId) ?? 0) + completion.coinReward;
    this.mem.wallets.set(completion.profileId, nb);
    const s = this.mem.stats.get(completion.profileId)!;
    s.totalCompletions += 1;
    const ns: UserStatsRow = { ...s };
    this.mem.stats.set(completion.profileId, ns);
    return { completion, newBalance: nb, stats: ns };
  }

  async getCompletions(profileId: string): Promise<CompletionRow[]> {
    if (pool) {
      const { rows } = await pool.query(
        "SELECT * FROM server_completions WHERE profile_id = $1 ORDER BY completed_at DESC",
        [profileId]
      );
      return rows.map((r) => ({
        id: r.id, habitId: r.habit_id, habitName: r.habit_name,
        coinReward: r.coin_reward, completedAt: new Date(r.completed_at).toISOString(), profileId: r.profile_id,
      }));
    }
    return Array.from(this.mem.completions.values()).filter((c) => c.profileId === profileId);
  }

  // ─────────────── REDEMPTIONS (deduct wallet, atomic) ───────────────
  async redeemReward(input: {
    id: string;
    rewardId: string;
    rewardName: string;
    cost: number;
    profileId: string;
  }): Promise<{ redemption: RedemptionRow; newBalance: number }> {
    const redemption: RedemptionRow = {
      id: input.id, rewardId: input.rewardId, rewardName: input.rewardName,
      cost: input.cost, redeemedAt: new Date().toISOString(), profileId: input.profileId,
    };
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: bal } = await client.query("SELECT balance FROM server_wallet WHERE profile_id=$1 FOR UPDATE", [input.profileId]);
        const current = bal[0]?.balance ?? 0;
        if (current < input.cost) {
          await client.query("ROLLBACK");
          throw new Error("INSUFFICIENT_FUNDS");
        }
        await client.query("INSERT INTO server_redemptions (id,reward_id,reward_name,cost,redeemed_at,profile_id) VALUES ($1,$2,$3,$4,$5,$6)",
          [redemption.id, redemption.rewardId, redemption.rewardName, redemption.cost, redemption.redeemedAt, redemption.profileId]);
        const { rows: nb } = await client.query("UPDATE server_wallet SET balance = balance - $2 WHERE profile_id=$1 RETURNING balance", [input.profileId, input.cost]);
        await client.query("COMMIT");
        return { redemption, newBalance: nb[0].balance };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    this.mem.ensure(input.profileId);
    const cur = this.mem.wallets.get(input.profileId) ?? 0;
    if (cur < input.cost) throw new Error("INSUFFICIENT_FUNDS");
    this.mem.wallets.set(input.profileId, cur - input.cost);
    this.mem.redemptions.set(redemption.id, redemption);
    return { redemption, newBalance: cur - input.cost };
  }

  async getRedemptions(profileId: string): Promise<RedemptionRow[]> {
    if (pool) {
      const { rows } = await pool.query("SELECT * FROM server_redemptions WHERE profile_id=$1 ORDER BY redeemed_at DESC", [profileId]);
      return rows.map((r) => ({
        id: r.id, rewardId: r.reward_id, rewardName: r.reward_name,
        cost: r.cost, redeemedAt: new Date(r.redeemed_at).toISOString(), profileId: r.profile_id,
      }));
    }
    return Array.from(this.mem.redemptions.values()).filter((x) => x.profileId === profileId);
  }

  // ─────────────── WALLET ───────────────
  // Create the wallet row if missing (used by mutation paths, not by reads).
  async ensureWallet(profileId: string): Promise<void> {
    if (pool) {
      await pool.query(
        "INSERT INTO server_wallet (profile_id,balance) VALUES ($1,0) ON CONFLICT (profile_id) DO NOTHING",
        [profileId]
      );
    }
  }

  async getWallet(profileId: string): Promise<number> {
    if (pool) {
      // profile may have been deleted (COPPA); don't force-create a wallet row.
      const { rows } = await pool.query("SELECT balance FROM server_wallet WHERE profile_id=$1", [profileId]);
      return rows[0]?.balance ?? 0;
    }
    this.mem.ensure(profileId);
    return this.mem.wallets.get(profileId) ?? 0;
  }

  async adjustWallet(profileId: string, delta: number): Promise<number> {
    if (pool) {
      await this.ensureWallet(profileId);
      const { rows } = await pool.query(
        "INSERT INTO server_wallet (profile_id,balance) VALUES ($1,$2) ON CONFLICT (profile_id) DO UPDATE SET balance = GREATEST(0, server_wallet.balance + $2) RETURNING balance",
        [profileId, delta]
      );
      return rows[0].balance;
    }
    this.mem.ensure(profileId);
    const nb = Math.max(0, (this.mem.wallets.get(profileId) ?? 0) + delta);
    this.mem.wallets.set(profileId, nb);
    return nb;
  }

  // ─────────────── STATS ───────────────
  private statsFromRow(r: any): UserStatsRow {
    return {
      profileId: r.profile_id,
      totalCompletions: r.total_completions,
      longestStreak: r.longest_streak,
      longestSingleHabitStreak: r.longest_single_habit_streak,
      longestSingleHabitId: r.longest_single_habit_id ?? null,
    };
  }

  async getUserStats(profileId: string): Promise<UserStatsRow> {
    if (pool) {
      // Read-only: profile may be deleted (COPPA). Return zeros rather than
      // force-creating a stats row (which would FK-violate on a missing profile).
      const { rows } = await pool.query("SELECT * FROM server_user_stats WHERE profile_id=$1", [profileId]);
      if (!rows[0]) {
        return { profileId, totalCompletions: 0, longestStreak: 0, longestSingleHabitStreak: 0, longestSingleHabitId: null };
      }
      return this.statsFromRow(rows[0]);
    }
    this.mem.ensure(profileId);
    return this.mem.stats.get(profileId)!;
  }

  // ─────────────── ACHIEVEMENTS ───────────────
  async getAchievements(profileId: string): Promise<{ id: string; trophyId: string; unlockedAt: string; profileId: string }[]> {
    if (pool) {
      const { rows } = await pool.query("SELECT * FROM server_achievements WHERE profile_id=$1", [profileId]);
      return rows.map((r) => ({ id: r.id, trophyId: r.trophy_id, unlockedAt: new Date(r.unlocked_at).toISOString(), profileId: r.profile_id }));
    }
    return Array.from(this.mem.achievements.values()).filter((a) => a.profileId === profileId);
  }

  async unlockAchievement(profileId: string, trophyId: string): Promise<{ id: string; trophyId: string; unlockedAt: string; profileId: string } | null> {
    if (pool) {
      const { rows } = await pool.query(
        "INSERT INTO server_achievements (id,trophy_id,unlocked_at,profile_id) VALUES ($1,$2,now(),$3) ON CONFLICT (id) DO NOTHING RETURNING *",
        [randomUUID(), trophyId, profileId]
      );
      return rows[0] ? { id: rows[0].id, trophyId: rows[0].trophy_id, unlockedAt: new Date(rows[0].unlocked_at).toISOString(), profileId: rows[0].profile_id } : null;
    }
    // in-memory: skip if already unlocked
    const existing = Array.from(this.mem.achievements.values()).find((a) => a.profileId === profileId && a.trophyId === trophyId);
    if (existing) return null;
    const a = { id: randomUUID(), trophyId, unlockedAt: new Date().toISOString(), profileId };
    this.mem.achievements.set(a.id, a);
    return a;
  }

  // ─────────────── PURCHASED SKILLS ───────────────
  async getPurchasedSkills(profileId: string): Promise<{ id: string; skillId: string; profileId: string }[]> {
    if (pool) {
      const { rows } = await pool.query("SELECT * FROM server_purchased_skills WHERE profile_id=$1", [profileId]);
      return rows.map((r) => ({ id: r.id, skillId: r.skill_id, profileId: r.profile_id }));
    }
    return Array.from(this.mem.purchasedSkills.values()).filter((s) => s.profileId === profileId);
  }

  async purchaseSkill(profileId: string, skillId: string): Promise<{ id: string; skillId: string; profileId: string } | null> {
    if (pool) {
      const { rows } = await pool.query(
        "INSERT INTO server_purchased_skills (id,skill_id,profile_id) VALUES ($1,$2,$3) ON CONFLICT (profile_id,skill_id) DO NOTHING RETURNING *",
        [randomUUID(), skillId, profileId]
      );
      return rows[0] ? { id: rows[0].id, skillId: rows[0].skill_id, profileId: rows[0].profile_id } : null;
    }
    const existing = Array.from(this.mem.purchasedSkills.values()).find((s) => s.profileId === profileId && s.skillId === skillId);
    if (existing) return null;
    const s = { id: randomUUID(), skillId, profileId };
    this.mem.purchasedSkills.set(s.id, s);
    return s;
  }

  // ─────────────── BULK UPSERT (sync upload) ───────────────
  async upsertHabitBatch(rows: HabitRow[]): Promise<void> {
    for (const h of rows) {
      const { createdAt, deletedAt, ...rest } = h;
      void createdAt; void deletedAt;
      await this.createHabit(rest);
    }
  }

  /**
   * COPPA / GDPR-K: permanently purge every domain entity owned by a profile.
   * Used by DELETE /user/:id/data. In-memory fallback clears the maps; the
   * Postgres path relies on the caller (storage.deleteUserData) running the
   * corresponding DELETE statements, so this only guards the in-memory store.
   */
  purgeProfile(profileId: string): void {
    for (const [id, h] of this.mem.habits) if (h.profileId === profileId) this.mem.habits.delete(id);
    for (const [id, r] of this.mem.rewards) if (r.profileId === profileId) this.mem.rewards.delete(id);
    for (const [id, c] of this.mem.completions) if (c.profileId === profileId) this.mem.completions.delete(id);
    for (const [id, r] of this.mem.redemptions) if (r.profileId === profileId) this.mem.redemptions.delete(id);
    for (const [id, a] of this.mem.achievements) if (a.profileId === profileId) this.mem.achievements.delete(id);
    for (const [id, s] of this.mem.purchasedSkills) if (s.profileId === profileId) this.mem.purchasedSkills.delete(id);
    this.mem.wallets.delete(profileId);
    this.mem.stats.delete(profileId);
  }
}

export const domain = new DomainStore();
