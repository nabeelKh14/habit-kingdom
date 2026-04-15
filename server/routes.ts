import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { storage, type User } from "./storage";
import { signToken, authenticate, requireParent, authLimiter, sanitizeInput } from "./middleware";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Apply global middleware
  app.use(sanitizeInput);

  // ===== AUTH ROUTES =====
  
  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || typeof username !== "string") {
        res.status(400).json({ error: "INVALID_INPUT", message: "Username is required" });
        return;
      }

      if (!password || typeof password !== "string") {
        res.status(400).json({ error: "INVALID_INPUT", message: "Password is required" });
        return;
      }

      const user = await storage.createUser({ username, password });
      const session = await storage.createSession(user.id, user.username);
      const token = signToken({ userId: user.id, username: user.username });

      res.status(201).json({
        user: { id: user.id, username: user.username, createdAt: user.createdAt },
        token,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    } catch (error: any) {
      console.error("[Auth] Registration error:", error);
      res.status(400).json({ error: "REGISTRATION_FAILED", message: error.message });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
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
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      res.status(500).json({ error: "LOGIN_FAILED", message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", authenticate, async (req: Request, res: Response) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        await storage.invalidateSession(token);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Auth] Logout error:", error);
      res.status(500).json({ error: "LOGOUT_FAILED", message: "Logout failed" });
    }
  });

  // ===== USER PROFILE ROUTES =====

  app.get("/api/user", authenticate, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const fullUser = await storage.getUser(user.userId);
      if (!fullUser) {
        res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
        return;
      }
      res.json({ id: fullUser.id, username: fullUser.username, createdAt: fullUser.createdAt });
    } catch (error: any) {
      console.error("[User] Get error:", error);
      res.status(500).json({ error: "GET_USER_FAILED", message: "Failed to get user" });
    }
  });

  // ===== HABITS ROUTES =====

  app.get("/api/habits", authenticate, async (req: Request, res: Response) => {
    try {
      // For local server, we don't have the mobile database
      // This is a placeholder for the API structure
      res.json({ habits: [], message: "Habits synced from mobile app" });
    } catch (error: any) {
      console.error("[Habits] Get error:", error);
      res.status(500).json({ error: "GET_HABITS_FAILED", message: "Failed to get habits" });
    }
  });

  app.post("/api/habits", authenticate, async (req: Request, res: Response) => {
    try {
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
    } catch (error: any) {
      console.error("[Habits] Create error:", error);
      res.status(500).json({ error: "CREATE_HABIT_FAILED", message: "Failed to create habit" });
    }
  });

  app.put("/api/habits/:id", authenticate, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "INVALID_INPUT", message: "Habit ID is required" });
        return;
      }
      res.json({ id, ...req.body, updatedAt: new Date().toISOString() });
    } catch (error: any) {
      console.error("[Habits] Update error:", error);
      res.status(500).json({ error: "UPDATE_HABIT_FAILED", message: "Failed to update habit" });
    }
  });

  app.delete("/api/habits/:id", authenticate, requireParent, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "INVALID_INPUT", message: "Habit ID is required" });
        return;
      }
      res.json({ success: true, deletedId: id });
    } catch (error: any) {
      console.error("[Habits] Delete error:", error);
      res.status(500).json({ error: "DELETE_HABIT_FAILED", message: "Failed to delete habit" });
    }
  });

  // ===== REWARDS ROUTES =====

  app.get("/api/rewards", authenticate, async (req: Request, res: Response) => {
    try {
      res.json({ rewards: [], message: "Rewards synced from mobile app" });
    } catch (error: any) {
      console.error("[Rewards] Get error:", error);
      res.status(500).json({ error: "GET_REWARDS_FAILED", message: "Failed to get rewards" });
    }
  });

  app.post("/api/rewards", authenticate, requireParent, async (req: Request, res: Response) => {
    try {
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
    } catch (error: any) {
      console.error("[Rewards] Create error:", error);
      res.status(500).json({ error: "CREATE_REWARD_FAILED", message: "Failed to create reward" });
    }
  });

  app.post("/api/rewards/:id/redeem", authenticate, async (req: Request, res: Response) => {
    try {
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
    } catch (error: any) {
      console.error("[Rewards] Redeem error:", error);
      res.status(500).json({ error: "REDEEM_FAILED", message: "Failed to redeem reward" });
    }
  });

  // ===== ADMIN ROUTES (Parent Only) =====

  app.post("/api/admin/bonus", authenticate, requireParent, async (req: Request, res: Response) => {
    try {
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
    } catch (error: any) {
      console.error("[Admin] Bonus error:", error);
      res.status(500).json({ error: "BONUS_FAILED", message: "Failed to add bonus" });
    }
  });

  app.post("/api/admin/penalty", authenticate, requireParent, async (req: Request, res: Response) => {
    try {
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
    } catch (error: any) {
      console.error("[Admin] Penalty error:", error);
      res.status(500).json({ error: "PENALTY_FAILED", message: "Failed to apply penalty" });
    }
  });

  app.post("/api/admin/reset-streak", authenticate, requireParent, async (req: Request, res: Response) => {
    try {
      const { profileId } = req.body;
      res.json({
        success: true,
        profileId: profileId || "default",
        resetAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[Admin] Reset streak error:", error);
      res.status(500).json({ error: "RESET_FAILED", message: "Failed to reset streak" });
    }
  });

  // ===== SYNC ROUTES =====

  app.post("/api/sync/upload", authenticate, async (req: Request, res: Response) => {
    try {
      const { habits, rewards, completions, redemptions } = req.body;
      
      // Validate structure
      if (!habits || !Array.isArray(habits)) {
        res.status(400).json({ error: "INVALID_INPUT", message: "Habits array is required" });
        return;
      }

      // In a real implementation, this would merge with server data
      // For now, just acknowledge receipt
      res.json({
        success: true,
        syncedHabits: habits.length,
        syncedRewards: rewards?.length || 0,
        syncedCompletions: completions?.length || 0,
        syncedRedemptions: redemptions?.length || 0,
        syncedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[Sync] Upload error:", error);
      res.status(500).json({ error: "SYNC_FAILED", message: "Failed to sync data" });
    }
  });

  app.get("/api/sync/download", authenticate, async (req: Request, res: Response) => {
    try {
      // Return empty structure - actual data comes from mobile SQLite
      res.json({
        habits: [],
        rewards: [],
        completions: [],
        redemptions: [],
        syncedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[Sync] Download error:", error);
      res.status(500).json({ error: "SYNC_FAILED", message: "Failed to download data" });
    }
  });

  // ===== HEALTH CHECK =====
  
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  });

  return httpServer;
}
