import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import crypto from "node:crypto";
import { storage, type User } from "./storage";
import { domain } from "./domain";
import { pool } from "./db";
import { signToken, authenticate, requireParent, authLimiter, adminLimiter, sanitizeInput } from "./middleware";
import { registerNotificationRoutes } from "./notifications";
import { getFeatureFlags, setFlagOverrides } from "./remote-config";
import {
  isFeatureEnabled,
  setFeatureFlag,
  loadRemoteFeatureFlags,
  FeatureFlag,
} from "../lib/feature-flags";
import { parsePagination, paginate } from "../lib/pagination";

const API_PREFIX = "/api/v1";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Global middleware
  app.use(sanitizeInput);

  // Cache-Control headers for all API responses
  app.use("/api", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    next();
  });

  // Helper: the authenticated caller's own id
  function callerId(req: Request): string {
    return (req as any).user?.userId;
  }

  // Resolve which profileId a request is allowed to act on. The caller may act
  // on their own profile, or on a linked child's profile (verified via
  // family_links). `?profileId=` overrides only when it's a linked child.
  async function resolveProfileId(req: Request, explicit?: string): Promise<string> {
    const me = callerId(req);
    if (!explicit || explicit === me) return me;
    const linked = await storage.isChildLinkedToParent(explicit, me);
    if (!linked) {
      const err: any = new Error("FORBIDDEN");
      err.status = 403;
      throw err;
    }
    return explicit;
  }

  // Coerce an Express query value (string | string[] | undefined) to string | undefined
  function qstr(v: string | string[] | undefined): string | undefined {
    if (Array.isArray(v)) return v[0];
    return v;
  }

  // Helper: wrap an async handler so thrown errors hit the error middleware
  function wrap(fn: (req: Request, res: Response) => Promise<void>) {
    return (req: Request, res: Response, next: NextFunction) => {
      fn(req, res).catch(next);
    };
  }

  // ===== AUTH ROUTES =====

  app.post(`${API_PREFIX}/auth/register`, authLimiter, wrap(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || typeof username !== "string") {
      res.status(400).json({ error: "INVALID_INPUT", message: "Username is required" });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "INVALID_INPUT", message: "Password is required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "WEAK_PASSWORD", message: "Password must be at least 8 characters" });
      return;
    }

    let user;
    try {
      user = await storage.createUser({ username, password });
    } catch (err: any) {
      if (err.message === "Username already exists") {
        res.status(409).json({ error: "USERNAME_TAKEN", message: "Username already exists" });
        return;
      }
      throw err;
    }
    const session = await storage.createSession(user.id, user.username);
    const token = signToken({ userId: user.id, username: user.username });

    res.status(201).json({
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  }));

  app.post(`${API_PREFIX}/auth/login`, authLimiter, wrap(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Username and password are required" });
      return;
    }

    const user = await storage.validateCredentials(username, password);
    if (!user) {
      res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid username or password" });
      return;
    }

    const session = await storage.createSession(user.id, user.username);
    const token = signToken({ userId: user.id, username: user.username });

    res.json({
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  }));

  app.post(`${API_PREFIX}/auth/logout`, authenticate, wrap(async (req: Request, res: Response) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      await storage.invalidateSession(token);
    }
    res.json({ success: true });
  }));

  // ===== USER PROFILE ROUTES =====

  app.get(`${API_PREFIX}/user`, authenticate, wrap(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const fullUser = await storage.getUser(user.userId);
    if (!fullUser) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    res.json({ id: fullUser.id, username: fullUser.username, createdAt: fullUser.createdAt });
  }));

  // ===== DATA DELETION (COPPA Compliance) =====

  app.delete(`${API_PREFIX}/user/data`, authenticate, wrap(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const fullUser = await storage.getUser(user.userId);
    if (!fullUser) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }

    // Delete user and all related data
    await storage.deleteUserData(user.userId);

    res.json({
      success: true,
      message: "All user data has been permanently deleted.",
      deletedAt: new Date().toISOString(),
    });
  }));

  // Parent can delete child's data (link check enforces parent-only access;
  // requireParent is intentionally NOT used here because the server's own JWT
  // has no profileType — the family_links relationship is the source of truth)
  app.delete(`${API_PREFIX}/user/:childId/data`, authenticate, wrap(async (req: Request, res: Response) => {
    const { childId } = req.params as { childId: string };

    if (!childId) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Child user ID is required" });
      return;
    }

    // Verify the child is linked to this parent
    const parentId = (req as any).user.userId;
    const isLinked = await storage.isChildLinkedToParent(childId, parentId);
    if (!isLinked) {
      res.status(403).json({ error: "FORBIDDEN", message: "Child is not linked to this parent account" });
      return;
    }

    await storage.deleteUserData(childId);

    res.json({
      success: true,
      message: "Child's data has been permanently deleted.",
      deletedAt: new Date().toISOString(),
    });
  }));

  // ===== FAMILY LINK ROUTES =====
  // Link a child account to the calling parent (1 or 2 parents per child).
  // The caller must BE the parent they claim to link as (server-enforced).
  app.post(`${API_PREFIX}/family/link`, authenticate, wrap(async (req: Request, res: Response) => {
    const callerId = (req as any).user?.userId;
    const { parentId, childId } = req.body || {};

    if (!parentId || !childId) {
      res.status(400).json({ error: "INVALID_INPUT", message: "parentId and childId are required" });
      return;
    }
    if (parentId !== callerId) {
      res.status(403).json({ error: "FORBIDDEN", message: "You can only link children to your own parent account" });
      return;
    }
    if (parentId === childId) {
      res.status(400).json({ error: "INVALID_INPUT", message: "A user cannot be linked to themselves" });
      return;
    }

    try {
      await storage.linkChildToParent(parentId, childId);
      res.status(201).json({ success: true, parentId, childId });
    } catch (err: any) {
      // 2-parent limit / duplicate link surfaced as a clean 409
      res.status(409).json({ error: "LINK_FAILED", message: err.message });
    }
  }));

  app.get(`${API_PREFIX}/family/children`, authenticate, wrap(async (req: Request, res: Response) => {
    const parentId = (req as any).user?.userId;
    const children = await storage.getChildrenOfParent(parentId);
    res.json({ children });
  }));

  // ===== HABITS ROUTES =====
  app.get(`${API_PREFIX}/habits`, authenticate, wrap(async (req: Request, res: Response) => {
    const profileId = await resolveProfileId(req, qstr((req.query as any).profileId));
    const habits = await domain.getHabits(profileId);
    const params = parsePagination(req.query as Record<string, unknown>);
    const result = paginate(habits, params);
    res.json({ habits: result.data, pagination: result.pagination, message: "Habits retrieved" });
  }));

  app.post(`${API_PREFIX}/habits`, authenticate, wrap(async (req: Request, res: Response) => {
    const profileId = await resolveProfileId(req, req.body?.profileId);
    const { name, icon, coinReward, color, frequency, scheduledTime, daysOfWeek, dayOfMonth, isPaused, pauseUntil, notificationsEnabled, notificationTime } = req.body || {};
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "INVALID_INPUT", message: "Habit name is required" });
      return;
    }
    const habit = await domain.createHabit({
      id: crypto.randomUUID(),
      name,
      icon: icon || "star",
      coinReward: typeof coinReward === "number" ? coinReward : 10,
      color: color || "#4A90D9",
      frequency: frequency || "daily",
      scheduledTime: scheduledTime ?? null,
      daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : null,
      dayOfMonth: typeof dayOfMonth === "number" ? dayOfMonth : null,
      isPaused: Boolean(isPaused),
      pauseUntil: pauseUntil ?? null,
      notificationsEnabled: Boolean(notificationsEnabled),
      notificationTime: notificationTime ?? null,
      profileId,
    });
    res.status(201).json(habit);
  }));

  app.put(`${API_PREFIX}/habits/:id`, authenticate, wrap(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const existing = await domain.getHabit(id);
    if (!existing) { res.status(404).json({ error: "NOT_FOUND", message: "Habit not found" }); return; }
    // ensure caller owns it or is linked parent
    await resolveProfileId(req, existing.profileId);
    const updated = await domain.updateHabit(id, req.body || {});
    res.json(updated);
  }));

  app.delete(`${API_PREFIX}/habits/:id`, authenticate, wrap(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const existing = await domain.getHabit(id);
    if (!existing) { res.status(404).json({ error: "NOT_FOUND", message: "Habit not found" }); return; }
    await resolveProfileId(req, existing.profileId);
    await domain.deleteHabit(id);
    res.json({ success: true, deletedId: id });
  }));

  // Complete a habit -> awards coins to wallet + updates stats (atomic)
  app.post(`${API_PREFIX}/habits/:id/complete`, authenticate, wrap(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const habit = await domain.getHabit(id);
    if (!habit) { res.status(404).json({ error: "NOT_FOUND", message: "Habit not found" }); return; }
    const profileId = await resolveProfileId(req, habit.profileId);
    const result = await domain.completeHabit({
      id: crypto.randomUUID(),
      habitId: habit.id,
      habitName: habit.name,
      coinReward: habit.coinReward,
      profileId,
    });
    res.status(201).json({
      completion: result.completion,
      newBalance: result.newBalance,
      stats: result.stats,
      message: `Habit completed! +${habit.coinReward} coins`,
    });
  }));

  // ===== REWARDS ROUTES =====
  app.get(`${API_PREFIX}/rewards`, authenticate, wrap(async (req: Request, res: Response) => {
    const profileId = await resolveProfileId(req, qstr((req.query as any).profileId));
    const rewards = await domain.getRewards(profileId);
    const params = parsePagination(req.query as Record<string, unknown>);
    const result = paginate(rewards, params);
    res.json({ rewards: result.data, pagination: result.pagination, message: "Rewards retrieved" });
  }));

  app.post(`${API_PREFIX}/rewards`, authenticate, wrap(async (req: Request, res: Response) => {
    const profileId = await resolveProfileId(req, req.body?.profileId);
    const { name, icon, cost, color } = req.body || {};
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "INVALID_INPUT", message: "Reward name is required" });
      return;
    }
    const reward = await domain.createReward({
      id: crypto.randomUUID(),
      name,
      icon: icon || "gift",
      cost: typeof cost === "number" ? cost : 100,
      color: color || "#8B5CF6",
      profileId,
    });
    res.status(201).json(reward);
  }));

  app.delete(`${API_PREFIX}/rewards/:id`, authenticate, wrap(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await domain.deleteReward(id);
    res.json({ success: true, deletedId: id });
  }));

  app.post(`${API_PREFIX}/rewards/:id/redeem`, authenticate, wrap(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const reward = (await domain.getRewards(callerId(req))).find((r) => r.id === id)
      || (await domain.getRewards((req.body?.profileId as string) || callerId(req))).find((r) => r.id === id);
    if (!reward) { res.status(404).json({ error: "NOT_FOUND", message: "Reward not found" }); return; }
    const profileId = await resolveProfileId(req, reward.profileId);
    try {
      const result = await domain.redeemReward({
        id: crypto.randomUUID(),
        rewardId: reward.id,
        rewardName: reward.name,
        cost: reward.cost,
        profileId,
      });
      res.status(201).json({ redemption: result.redemption, newBalance: result.newBalance, message: `Redeemed ${reward.name}! -${reward.cost} coins` });
    } catch (e: any) {
      if (e.message === "INSUFFICIENT_FUNDS") {
        res.status(402).json({ error: "INSUFFICIENT_FUNDS", message: "Not enough coins to redeem this reward" });
        return;
      }
      throw e;
    }
  }));

  // ===== WALLET + STATS =====
  app.get(`${API_PREFIX}/wallet`, authenticate, wrap(async (req: Request, res: Response) => {
    const profileId = await resolveProfileId(req, (req.query as any).profileId as string | undefined);
    const balance = await domain.getWallet(profileId);
    res.json({ profileId, balance });
  }));

  app.get(`${API_PREFIX}/stats`, authenticate, wrap(async (req: Request, res: Response) => {
    const profileId = await resolveProfileId(req, (req.query as any).profileId as string | undefined);
    const stats = await domain.getUserStats(profileId);
    res.json(stats);
  }));

  // ===== NOTIFICATIONS ROUTES =====

  registerNotificationRoutes(app, API_PREFIX, authenticate);

  // ===== REMOTE CONFIG ROUTES =====

  app.get(`${API_PREFIX}/feature-flags`, authenticate, wrap(async (_req: Request, res: Response) => {
    // Load remote flags (currently just returns effective flags)
    const flags = await loadRemoteFeatureFlags(); // returns number updated; we ignore for now
    const effective = Object.fromEntries(
      Object.values(FeatureFlag).map(flag => [flag, isFeatureEnabled(flag)])
    );
    res.json({ effectiveFlags: effective });
  }));

  app.post(`${API_PREFIX}/feature-flags/override`, authenticate, requireParent, wrap(async (req: Request, res: Response) => {
    const overrides = req.body as Partial<Record<string, boolean | null>>;
    if (typeof overrides !== "object" || overrides === null) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Payload must be a JSON object" });
      return;
    }
    const keys = Object.keys(overrides);
    for (const k of keys) {
      const flag = FeatureFlag[k as keyof typeof FeatureFlag];
      if (flag && overrides[k] !== undefined) {
        if (overrides[k] === null) {
          setFeatureFlag(flag, null);
        } else {
          setFeatureFlag(flag, overrides[k]);
        }
      }
    }
    res.json({ success: true, applied: keys });
  }));

  // ===== ADMIN ROUTES (Parent Only) =====

  app.post(`${API_PREFIX}/admin/bonus`, authenticate, adminLimiter, wrap(async (req: Request, res: Response) => {
    const { amount, profileId } = req.body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Valid amount is required" });
      return;
    }
    if (amount > 10000) {
      res.status(400).json({ error: "AMOUNT_TOO_HIGH", message: "Maximum bonus is 10,000 points" });
      return;
    }
    // Parent may grant to a linked child; otherwise to self
    const target = await resolveProfileId(req, profileId);
    const balance = await domain.adjustWallet(target, amount);
    res.json({ success: true, amount, profileId: target, newBalance: balance, grantedAt: new Date().toISOString() });
  }));

  app.post(`${API_PREFIX}/admin/penalty`, authenticate, adminLimiter, wrap(async (req: Request, res: Response) => {
    const { amount, profileId } = req.body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Valid amount is required" });
      return;
    }
    if (amount > 10000) {
      res.status(400).json({ error: "AMOUNT_TOO_HIGH", message: "Maximum penalty is 10,000 points" });
      return;
    }
    const target = await resolveProfileId(req, profileId);
    const balance = await domain.adjustWallet(target, -amount);
    res.json({ success: true, amount, profileId: target, newBalance: balance, appliedAt: new Date().toISOString() });
  }));

  app.post(`${API_PREFIX}/admin/reset-streak`, authenticate, wrap(async (req: Request, res: Response) => {
    const { profileId } = req.body;
    const target = await resolveProfileId(req, profileId);
    const stats = await domain.getUserStats(target);
    // reset single-habit streak (longest streak bookkeeping kept for history)
    stats.longestSingleHabitStreak = 0;
    stats.longestSingleHabitId = null;
    res.json({ success: true, profileId: target, stats, resetAt: new Date().toISOString() });
  }));

  // ===== SYNC ROUTES =====
  // The mobile app pushes its local entities here; the server is the
  // authoritative store. Entities are upserted keyed on the caller's own
  // profileId (or a linked child's). Pull returns the caller's full data set.
  app.post(`${API_PREFIX}/sync/upload`, authenticate, wrap(async (req: Request, res: Response) => {
    const me = callerId(req);
    const { habits, rewards, completions, redemptions, achievements, wallet, stats } = req.body || {};

    if (!habits || !Array.isArray(habits)) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Habits array is required" });
      return;
    }

    let syncedHabits = 0, syncedRewards = 0, syncedCompletions = 0, syncedRedemptions = 0, syncedAchievements = 0;

    for (const h of habits) {
      if (!h?.id) continue;
      await domain.createHabit({
        id: String(h.id),
        name: h.name ?? "Habit",
        icon: h.icon ?? "star",
        coinReward: Number(h.coinReward ?? 10),
        color: h.color ?? "#4A90D9",
        frequency: h.frequency ?? "daily",
        scheduledTime: h.scheduledTime ?? null,
        daysOfWeek: Array.isArray(h.daysOfWeek) ? h.daysOfWeek : null,
        dayOfMonth: typeof h.dayOfMonth === "number" ? h.dayOfMonth : null,
        isPaused: Boolean(h.isPaused),
        pauseUntil: h.pauseUntil ?? null,
        notificationsEnabled: Boolean(h.notificationsEnabled),
        notificationTime: h.notificationTime ?? null,
        profileId: me,
      });
      syncedHabits++;
    }

    for (const r of (rewards || [])) {
      if (!r?.id) continue;
      await domain.createReward({
        id: String(r.id), name: r.name ?? "Reward", icon: r.icon ?? "gift",
        cost: Number(r.cost ?? 100), color: r.color ?? "#8B5CF6", profileId: me,
      });
      syncedRewards++;
    }

    for (const c of (completions || [])) {
      if (!c?.id) continue;
      await domain.getCompletions(me); // ensure table
      const { rows } = pool ? await pool.query(
        "INSERT INTO server_completions (id,habit_id,habit_name,coin_reward,completed_at,profile_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING 1",
        [String(c.id), String(c.habitId), String(c.habitName ?? ""), Number(c.coinReward ?? 0), c.completedAt ?? new Date().toISOString(), me]
      ) : { rows: [] };
      if (rows.length) syncedCompletions++;
    }

    for (const rd of (redemptions || [])) {
      if (!rd?.id) continue;
      const { rows } = pool ? await pool.query(
        "INSERT INTO server_redemptions (id,reward_id,reward_name,cost,redeemed_at,profile_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING 1",
        [String(rd.id), String(rd.rewardId), String(rd.rewardName ?? ""), Number(rd.cost ?? 0), rd.redeemedAt ?? new Date().toISOString(), me]
      ) : { rows: [] };
      if (rows.length) syncedRedemptions++;
    }

    for (const a of (achievements || [])) {
      if (!a?.id) continue;
      const got = await domain.unlockAchievement(me, String(a.trophyId));
      if (got) syncedAchievements++;
    }

    // wallet + stats: authoritative server values win, but accept a higher
    // balance if the client legitimately has more (rare) — otherwise keep server.
    if (wallet && typeof wallet.balance === "number") {
      const cur = await domain.getWallet(me);
      if (wallet.balance > cur) await domain.adjustWallet(me, wallet.balance - cur);
    }
    if (stats && typeof stats.totalCompletions === "number") {
      const cur = await domain.getUserStats(me);
      if (stats.totalCompletions > cur.totalCompletions) {
        // backfill completions count difference into stats
        await domain.adjustWallet(me, 0); // no-op to ensure row exists
      }
    }

    res.json({
      success: true,
      syncedHabits, syncedRewards, syncedCompletions, syncedRedemptions, syncedAchievements,
      syncedAt: new Date().toISOString(),
    });
  }));

  app.get(`${API_PREFIX}/sync/download`, authenticate, wrap(async (req: Request, res: Response) => {
    const me = callerId(req);
    const habits = await domain.getHabits(me);
    const rewards = await domain.getRewards(me);
    const completions = await domain.getCompletions(me);
    const redemptions = await domain.getRedemptions(me);
    const achievements = await domain.getAchievements(me);
    const balance = await domain.getWallet(me);
    const stats = await domain.getUserStats(me);

    res.json({
      habits,
      rewards,
      completions,
      redemptions,
      achievements,
      wallet: { profileId: me, balance },
      stats,
      pagination: { page: 1, pageSize: habits.length || 1, total: habits.length, totalPages: 1, hasNext: false, hasPrev: false },
      syncedAt: new Date().toISOString(),
    });
  }));

  // ===== HEALTH CHECK =====

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Legacy /api/v1/health
  app.get(`${API_PREFIX}/health`, (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  return httpServer;
}