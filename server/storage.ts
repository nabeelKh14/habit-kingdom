import { randomUUID } from "crypto";
import * as bcrypt from "bcrypt";
import type { ServerUser, UserSession } from "../shared/types";
import { pool, isSupabaseConfigured } from "./db";
import { domain } from "./domain";

// Configuration
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// Local type aliases for backward compatibility with routes
export type User = ServerUser;
export type { UserSession };

export interface InsertUser {
  username: string;
  password: string;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  validateCredentials(username: string, password: string): Promise<User | null>;
  createSession(userId: string, username: string): Promise<UserSession>;
  validateSession(token: string): Promise<UserSession | null>;
  invalidateSession(token: string): Promise<void>;
  invalidateAllSessions(userId: string): Promise<void>;

  // COPPA compliance: permanently delete all user data
  deleteUserData(userId: string): Promise<void>;

  // Verify parent-child relationship
  isChildLinkedToParent(childId: string, parentId: string): Promise<boolean>;

  // Create a parent<->child family link (1 or 2 parents per child)
  linkChildToParent(parentId: string, childId: string): Promise<void>;

  // List child ids linked to a parent
  getChildrenOfParent(parentId: string): Promise<string[]>;
}

/**
 * Durable storage backed by Postgres (direct pool) when configured.
 * Falls back to in-memory Maps when DB env is absent (dev / tests), so the
 * server always boots. Sessions are intentionally in-memory (ephemeral
 * tokens); only durable user + family data hits Postgres.
 */
export class SecureStorage implements IStorage {
  private users: Map<string, User>;
  private sessions: Map<string, UserSession>;
  // in-memory family links (parentId -> Set<childId>) for fallback mode
  private familyLinks: Map<string, Set<string>>;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.familyLinks = new Map();
  }

  private rowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
    };
  }

  async getUser(id: string): Promise<User | undefined> {
    if (pool) {
      const { rows } = await pool.query("SELECT * FROM server_users WHERE id = $1", [id]);
      return rows[0] ? this.rowToUser(rows[0]) : undefined;
    }
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (pool) {
      const { rows } = await pool.query("SELECT * FROM server_users WHERE LOWER(username) = LOWER($1)", [username]);
      return rows[0] ? this.rowToUser(rows[0]) : undefined;
    }
    return Array.from(this.users.values()).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!insertUser.username || insertUser.username.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }
    if (!insertUser.password || insertUser.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const passwordHash = await bcrypt.hash(insertUser.password, SALT_ROUNDS);

    if (pool) {
      const id = randomUUID();
      try {
        const { rows } = await pool.query(
          "INSERT INTO server_users (id, username, password_hash) VALUES ($1, $2, $3) RETURNING *",
          [id, insertUser.username, passwordHash]
        );
        return this.rowToUser(rows[0]);
      } catch (e: any) {
        if (e.code === "23505") throw new Error("Username already exists");
        throw e;
      }
    }

    // in-memory fallback
    if (await this.getUserByUsername(insertUser.username)) {
      throw new Error("Username already exists");
    }
    const user: User = {
      id: randomUUID(),
      username: insertUser.username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async validateCredentials(username: string, password: string): Promise<User | null> {
    if (!username || !password) return null;
    const user = await this.getUserByUsername(username);
    if (!user) return null;
    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  async createSession(userId: string, username: string): Promise<UserSession> {
    const token = randomUUID() + "-" + randomUUID();
    const session: UserSession = {
      token,
      userId,
      username,
      expiresAt: Date.now() + TOKEN_EXPIRY,
    };
    this.sessions.set(token, session);
    return session;
  }

  async validateSession(token: string): Promise<UserSession | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  async invalidateSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async invalidateAllSessions(userId: string): Promise<void> {
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === userId) this.sessions.delete(token);
    }
  }

  async deleteUserData(userId: string): Promise<void> {
    this.invalidateAllSessions(userId);
    if (pool) {
      // COPPA/GDPR-K cascade: purge every server-authoritative domain entity
      // owned by this user before removing the user row itself. Order matters
      // only for clarity — these are independent DELETEs, not FK-dependent.
      const tables = [
        "server_completions",
        "server_redemptions",
        "server_achievements",
        "server_purchased_skills",
        "server_wallet",
        "server_user_stats",
        "server_rewards",
        "server_habits",
      ];
      for (const t of tables) {
        await pool.query(`DELETE FROM ${t} WHERE profile_id = $1`, [userId]);
      }
      await pool.query("DELETE FROM family_links WHERE parent_id = $1 OR child_id = $1", [userId]);
      await pool.query("DELETE FROM server_users WHERE id = $1", [userId]);
    } else {
      this.users.delete(userId);
      this.familyLinks.delete(userId);
      // In-memory DomainStore is a separate singleton — clear it too.
      domain.purgeProfile(userId);
    }
    console.log(`[Data Deletion] Permanently deleted all data for user ${userId}`);
  }

  async isChildLinkedToParent(childId: string, parentId: string): Promise<boolean> {
    if (pool) {
      const { rows } = await pool.query(
        "SELECT 1 FROM family_links WHERE child_id = $1 AND parent_id = $2 LIMIT 1",
        [childId, parentId]
      );
      return rows.length > 0;
    }
    return this.familyLinks.get(parentId)?.has(childId) ?? false;
  }

  async linkChildToParent(parentId: string, childId: string): Promise<void> {
    if (parentId === childId) throw new Error("A user cannot be their own parent");
    if (pool) {
      try {
        await pool.query(
          "INSERT INTO family_links (id, parent_id, child_id) VALUES ($1, $2, $3)",
          [randomUUID(), parentId, childId]
        );
      } catch (e: any) {
        if (e.code === "23514") throw new Error("A child may have at most 2 parents");
        if (e.code === "23505") throw new Error("Link already exists");
        throw e;
      }
      return;
    }
    // in-memory fallback
    const kids = this.familyLinks.get(parentId) ?? new Set<string>();
    if (kids.has(childId)) throw new Error("Link already exists");
    if (kids.size >= 2) throw new Error("A child may have at most 2 parents");
    kids.add(childId);
    this.familyLinks.set(parentId, kids);
  }

  async getChildrenOfParent(parentId: string): Promise<string[]> {
    if (pool) {
      const { rows } = await pool.query("SELECT child_id FROM family_links WHERE parent_id = $1", [parentId]);
      return rows.map((r: any) => r.child_id);
    }
    return Array.from(this.familyLinks.get(parentId) ?? []);
  }
}

export const storage = new SecureStorage();

// Helper to validate password strength
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (password.length > 128) {
    errors.push("Password must be less than 128 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
