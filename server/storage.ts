import { randomUUID } from "crypto";
import * as bcrypt from "bcrypt";
import type { ServerUser, UserSession } from "../shared/types";

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
}

export class SecureStorage implements IStorage {
  private users: Map<string, User>;
  private sessions: Map<string, UserSession>;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Validate input
    if (!insertUser.username || insertUser.username.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }
    if (!insertUser.password || insertUser.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Check for existing user
    const existing = await this.getUserByUsername(insertUser.username);
    if (existing) {
      throw new Error("Username already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(insertUser.password, SALT_ROUNDS);

    const id = randomUUID();
    const user: User = {
      id,
      username: insertUser.username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    this.users.set(id, user);
    return user;
  }

  async validateCredentials(username: string, password: string): Promise<User | null> {
    if (!username || !password) {
      return null;
    }

    const user = await this.getUserByUsername(username);
    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  async createSession(userId: string, username: string): Promise<UserSession> {
    const token = randomUUID() + "-" + randomUUID();
    const expiresAt = Date.now() + TOKEN_EXPIRY;

    const session: UserSession = {
      token,
      userId,
      username,
      expiresAt,
    };

    this.sessions.set(token, session);
    return session;
  }

  async validateSession(token: string): Promise<UserSession | null> {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

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
      if (session.userId === userId) {
        this.sessions.delete(token);
      }
    }
  }

  // COPPA compliance: permanently delete all user data
  async deleteUserData(userId: string): Promise<void> {
    this.users.delete(userId);
    for (const [token, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(token);
      }
    }
    console.log(`[Data Deletion] Permanently deleted all data for user ${userId}`);
  }

  // Verify parent-child relationship (in-memory stub)
  async isChildLinkedToParent(childId: string, parentId: string): Promise<boolean> {
    // In production, query DB for child-parent link
    // For now, allow if both users exist
    const child = this.users.get(childId);
    const parent = this.users.get(parentId);
    return !!child && !!parent;
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
