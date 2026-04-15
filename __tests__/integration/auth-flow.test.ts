import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecureStorage } from '../../server/storage';
import { signToken, verifyToken } from '../../server/middleware';

describe('Complete User Flow', () => {
  let testStorage: SecureStorage;

  beforeEach(() => {
    testStorage = new SecureStorage();
  });

  describe('Registration -> Login -> Session', () => {
    it('should support complete user lifecycle', async () => {
      // 1. Register
      const newUser = await testStorage.createUser({
        username: 'testuser',
        password: 'SecurePassword123!',
      });
      expect(newUser.id).toBeDefined();
      expect(newUser.username).toBe('testuser');

      // 2. Validate credentials
      const validUser = await testStorage.validateCredentials(
        'testuser',
        'SecurePassword123!'
      );
      expect(validUser?.id).toBe(newUser.id);

      // 3. Create session
      const session = await testStorage.createSession(
        newUser.id,
        newUser.username
      );
      expect(session.token).toBeDefined();
      expect(session.expiresAt).toBeGreaterThan(Date.now());

      // 4. Validate session
      const validatedSession = await testStorage.validateSession(session.token);
      expect(validatedSession?.userId).toBe(newUser.id);

      // 5. Create JWT token
      const jwtToken = signToken({
        userId: newUser.id,
        username: newUser.username,
      });
      expect(jwtToken).toBeDefined();

      // 6. Verify JWT token
      const decoded = verifyToken(jwtToken);
      expect(decoded?.userId).toBe(newUser.id);
      expect(decoded?.username).toBe(newUser.username);
    });
  });

  describe('Profile-Based Access Control', () => {
    it('should support parent/child profile distinction in JWT', () => {
      // Parent token
      const parentToken = signToken({
        userId: 'parent-1',
        username: 'parent',
        profileType: 'parent',
      });

      // Child token
      const childToken = signToken({
        userId: 'child-1',
        username: 'child',
        profileType: 'child',
      });

      // Verify both tokens have correct profile types
      const parentDecoded = verifyToken(parentToken);
      const childDecoded = verifyToken(childToken);

      expect(parentDecoded?.profileType).toBe('parent');
      expect(childDecoded?.profileType).toBe('child');
    });
  });

  describe('Session Management', () => {
    it('should support multiple sessions per user', async () => {
      const userId = 'user-1';

      // Create multiple sessions
      const session1 = await testStorage.createSession(userId, 'user1');
      const session2 = await testStorage.createSession(userId, 'user1');
      const session3 = await testStorage.createSession(userId, 'user1');

      // All should be valid
      expect(await testStorage.validateSession(session1.token)).toBeDefined();
      expect(await testStorage.validateSession(session2.token)).toBeDefined();
      expect(await testStorage.validateSession(session3.token)).toBeDefined();

      // Invalidate all sessions
      await testStorage.invalidateAllSessions(userId);

      // All should be invalid
      expect(await testStorage.validateSession(session1.token)).toBeNull();
      expect(await testStorage.validateSession(session2.token)).toBeNull();
      expect(await testStorage.validateSession(session3.token)).toBeNull();
    });
  });
});

describe('Security Scenarios', () => {
  let testStorage: SecureStorage;

  beforeEach(() => {
    testStorage = new SecureStorage();
  });

  describe('Credential Security', () => {
    it('should hash passwords securely', async () => {
      const user = await testStorage.createUser({
        username: 'testuser',
        password: 'SecurePassword123!',
      });

      // Password hash should not equal plain text
      expect(user.passwordHash).not.toBe('SecurePassword123!');

      // Password hash should be different each time (due to salt)
      const user2 = await testStorage.createUser({
        username: 'testuser2',
        password: 'SecurePassword123!',
      });
      expect(user.passwordHash).not.toBe(user2.passwordHash);
    });

    it('should not allow login with wrong password', async () => {
      await testStorage.createUser({
        username: 'testuser',
        password: 'CorrectPassword123!',
      });

      const result = await testStorage.validateCredentials(
        'testuser',
        'WrongPassword123!'
      );
      expect(result).toBeNull();
    });
  });

  describe('Token Security', () => {
    it('should create unique tokens', async () => {
      const session1 = await testStorage.createSession('user1', 'user');
      const session2 = await testStorage.createSession('user1', 'user');
      const session3 = await testStorage.createSession('user1', 'user');

      const tokens = [session1.token, session2.token, session3.token];
      const uniqueTokens = new Set(tokens);

      expect(uniqueTokens.size).toBe(3);
    });

    it('should reject tampered tokens', () => {
      const token = signToken({ userId: 'user1', username: 'testuser' });

      // Split and modify
      const parts = token.split('.');
      parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64').toString()), extra: 'data' })).toString('base64url');

      const tamperedToken = parts.join('.');
      expect(verifyToken(tamperedToken)).toBeNull();
    });
  });
});
