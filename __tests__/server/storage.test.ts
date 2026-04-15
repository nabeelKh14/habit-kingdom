import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SecureStorage,
  validatePasswordStrength,
} from '../../server/storage';

describe('SecureStorage', () => {
  let testStorage: SecureStorage;

  beforeEach(() => {
    testStorage = new SecureStorage();
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const user = await testStorage.createUser({
        username: 'testuser',
        password: 'Password123!',
      });

      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.id).toBeDefined();
      expect(user.passwordHash).not.toBe('Password123!');
      expect(user.createdAt).toBeDefined();
    });

    it('should reject short username', async () => {
      await expect(
        testStorage.createUser({
          username: 'ab',
          password: 'Password123!',
        })
      ).rejects.toThrow('Username must be at least 3 characters');
    });

    it('should reject short password', async () => {
      await expect(
        testStorage.createUser({
          username: 'testuser',
          password: 'short',
        })
      ).rejects.toThrow('Password must be at least 6 characters');
    });

    it('should reject duplicate username', async () => {
      await testStorage.createUser({
        username: 'testuser',
        password: 'Password123!',
      });

      await expect(
        testStorage.createUser({
          username: 'testuser',
          password: 'Password123!',
        })
      ).rejects.toThrow('Username already exists');
    });

    it('should handle case-insensitive username uniqueness', async () => {
      await testStorage.createUser({
        username: 'TestUser',
        password: 'Password123!',
      });

      await expect(
        testStorage.createUser({
          username: 'testuser',
          password: 'Password123!',
        })
      ).rejects.toThrow('Username already exists');
    });
  });

  describe('validateCredentials', () => {
    beforeEach(async () => {
      await testStorage.createUser({
        username: 'testuser',
        password: 'Password123!',
      });
    });

    it('should return user for valid credentials', async () => {
      const user = await testStorage.validateCredentials('testuser', 'Password123!');

      expect(user).toBeDefined();
      expect(user?.username).toBe('testuser');
    });

    it('should return null for wrong password', async () => {
      const user = await testStorage.validateCredentials('testuser', 'WrongPassword!');

      expect(user).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const user = await testStorage.validateCredentials('nonexistent', 'Password123!');

      expect(user).toBeNull();
    });

    it('should be case-insensitive for username', async () => {
      const user = await testStorage.validateCredentials('TESTUSER', 'Password123!');

      expect(user).toBeDefined();
      expect(user?.username).toBe('testuser');
    });
  });

  describe('sessions', () => {
    beforeEach(async () => {
      await testStorage.createUser({
        username: 'testuser',
        password: 'Password123!',
      });
    });

    it('should create a session', async () => {
      const session = await testStorage.createSession('user-id', 'testuser');

      expect(session).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.userId).toBe('user-id');
      expect(session.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should validate a valid session', async () => {
      const session = await testStorage.createSession('user-id', 'testuser');
      const validated = await testStorage.validateSession(session.token);

      expect(validated).toBeDefined();
      expect(validated?.userId).toBe('user-id');
    });

    it('should return null for invalid session', async () => {
      const validated = await testStorage.validateSession('invalid-token');

      expect(validated).toBeNull();
    });

    it('should invalidate a session', async () => {
      const session = await testStorage.createSession('user-id', 'testuser');
      await testStorage.invalidateSession(session.token);

      const validated = await testStorage.validateSession(session.token);
      expect(validated).toBeNull();
    });

    it('should invalidate all sessions for user', async () => {
      await testStorage.createSession('user-id', 'testuser');
      await testStorage.createSession('user-id', 'testuser');

      await testStorage.invalidateAllSessions('user-id');

      const allSessions = (testStorage as any).sessions;
      expect(allSessions.size).toBe(0);
    });
  });
});

describe('validatePasswordStrength', () => {
  it('should accept strong passwords', () => {
    const result = validatePasswordStrength('Password123!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject short passwords', () => {
    const result = validatePasswordStrength('Pass1!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('should reject passwords without uppercase', () => {
    const result = validatePasswordStrength('password123');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('should reject passwords without lowercase', () => {
    const result = validatePasswordStrength('PASSWORD123');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('should reject passwords without numbers', () => {
    const result = validatePasswordStrength('PasswordABC');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('should reject overly long passwords', () => {
    const longPassword = 'A'.repeat(130) + 'abc123';
    const result = validatePasswordStrength(longPassword);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be less than 128 characters');
  });

  it('should return multiple errors for weak passwords', () => {
    const result = validatePasswordStrength('abc');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('Global storage instance', () => {
  it('should be a SecureStorage instance', async () => {
    const { storage } = await import('../../server/storage');
    expect(storage).toBeInstanceOf(SecureStorage);
  });
});
