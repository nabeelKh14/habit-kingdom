import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import crypto from "node:crypto";
import { storage, type User } from "./storage";
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

  // ── Helper ──
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
    // Paginated envelope. In this build the mobile app stores habits client-side
    // (Supabase), so the server returns an empty-but-paginated list until a
    // server-authoritative store is wired. The pagination contract is real + tested.
    const params = parsePagination(req.query as Record<string, unknown>);
    const result = paginate([], params);
    res.json({ habits: result.data, message: "Habits synced from mobile app", pagination: result.pagination });
  }));

  app.post(`${API_PREFIX}/habits`, authenticate, wrap(async (req: Request, res: Response) => {
    const { name, icon, coinReward, color, frequency } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "INVALID_INPUT", message: "Habit name is required" });
      return;
    }

    res.status(201).json({
      id: crypto.randomUUID(),
      name,
      icon: icon || "star",
      coinReward: coinReward || 10,
      color: color || "#4A90D9",
      frequency: frequency || "daily",
      createdAt: new Date().toISOString(),
    });
  }));

  app.put(`${API_PREFIX}/habits/:id`, authenticate, wrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Habit ID is required" });
      return;
    }
    res.json({ id, ...req.body, updatedAt: new Date().toISOString() });
  }));

  app.delete(`${API_PREFIX}/habits/:id`, authenticate, requireParent, wrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Habit ID is required" });
      return;
    }
    res.json({ success: true, deletedId: id });
  }));

  // ===== REWARDS ROUTES =====

  app.get(`${API_PREFIX}/rewards`, authenticate, wrap(async (req: Request, res: Response) => {
    const params = parsePagination(req.query as Record<string, unknown>);
    const result = paginate([], params);
    res.json({ rewards: result.data, message: "Rewards synced from mobile app", pagination: result.pagination });
  }));

  app.post(`${API_PREFIX}/rewards`, authenticate, requireParent, wrap(async (req: Request, res: Response) => {
    const { name, icon, cost, color } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "INVALID_INPUT", message: "Reward name is required" });
      return;
    }

    res.status(201).json({
      id: crypto.randomUUID(),
      name,
      icon: icon || "gift",
      cost: cost || 100,
      color: color || "#8B5CF6",
      createdAt: new Date().toISOString(),
    });
  }));

  app.post(`${API_PREFIX}/rewards/:id/redeem`, authenticate, wrap(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Reward ID is required" });
      return;
    }
    res.json({
      id: crypto.randomUUID(),
      rewardId: id,
      redeemedAt: new Date().toISOString(),
    });
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

  app.post(`${API_PREFIX}/admin/bonus`, authenticate, requireParent, adminLimiter, wrap(async (req: Request, res: Response) => {
    const { amount, profileId } = req.body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Valid amount is required" });
      return;
    }

    if (amount > 10000) {
      res.status(400).json({ error: "AMOUNT_TOO_HIGH", message: "Maximum bonus is 10,000 points" });
      return;
    }

    res.json({
      success: true,
      amount,
      profileId: profileId || "default",
      grantedAt: new Date().toISOString(),
    });
  }));

  app.post(`${API_PREFIX}/admin/penalty`, authenticate, requireParent, adminLimiter, wrap(async (req: Request, res: Response) => {
    const { amount, profileId } = req.body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Valid amount is required" });
      return;
    }

    if (amount > 10000) {
      res.status(400).json({ error: "AMOUNT_TOO_HIGH", message: "Maximum penalty is 10,000 points" });
      return;
    }

    res.json({
      success: true,
      amount,
      profileId: profileId || "default",
      appliedAt: new Date().toISOString(),
    });
  }));

  app.post(`${API_PREFIX}/admin/reset-streak`, authenticate, requireParent, wrap(async (req: Request, res: Response) => {
    const { profileId } = req.body;
    res.json({
      success: true,
      profileId: profileId || "default",
      resetAt: new Date().toISOString(),
    });
  }));

  // ===== SYNC ROUTES =====

  app.post(`${API_PREFIX}/sync/upload`, authenticate, wrap(async (req: Request, res: Response) => {
    const { habits, rewards, completions, redemptions } = req.body;

    if (!habits || !Array.isArray(habits)) {
      res.status(400).json({ error: "INVALID_INPUT", message: "Habits array is required" });
      return;
    }

    res.json({
      success: true,
      syncedHabits: habits.length,
      syncedRewards: rewards?.length || 0,
      syncedCompletions: completions?.length || 0,
      syncedRedemptions: redemptions?.length || 0,
      syncedAt: new Date().toISOString(),
    });
  }));

  app.get(`${API_PREFIX}/sync/download`, authenticate, wrap(async (req: Request, res: Response) => {
    const params = parsePagination(req.query as Record<string, unknown>);
    const habits = paginate([], params);
    // Pagination is applied to the primary collection; the rest mirror the page size.
    res.json({
      habits: habits.data,
      rewards: [],
      completions: [],
      redemptions: [],
      syncedAt: new Date().toISOString(),
      pagination: habits.pagination,
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