import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { signToken, verifyToken, authenticate, requireParent } from '../../server/middleware';

describe('JWT Token', () => {
  describe('signToken', () => {
    it('should create a valid JWT token', () => {
      const payload = { userId: 'test-user-id', username: 'testuser' };
      const token = signToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('should create tokens with different payloads', () => {
      const payload1 = { userId: 'user1', username: 'user1' };
      const payload2 = { userId: 'user2', username: 'user2' };
      
      const token1 = signToken(payload1);
      const token2 = signToken(payload2);
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = { userId: 'test-user-id', username: 'testuser' };
      const token = signToken(payload);
      
      const decoded = verifyToken(token);
      
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.username).toBe(payload.username);
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid.token.here');
      expect(decoded).toBeNull();
    });

    it('should return null for tampered token', () => {
      const payload = { userId: 'test-user-id', username: 'testuser' };
      const token = signToken(payload);
      
      const [header, payloadPart, signature] = token.split('.');
      const tamperedToken = `${header}.${payloadPart}extra.tampered`;
      
      const decoded = verifyToken(tamperedToken);
      expect(decoded).toBeNull();
    });

    it('should return null for empty token', () => {
      const decoded = verifyToken('');
      expect(decoded).toBeNull();
    });
  });
});

describe('Authentication Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: Mock;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should call next() for valid token', () => {
    const token = signToken({ userId: 'user1', username: 'testuser' });
    mockReq.headers.authorization = `Bearer ${token}`;
    
    authenticate(mockReq, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 401 for missing authorization header', () => {
    authenticate(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 for invalid token', () => {
    mockReq.headers.authorization = 'Bearer invalid.token.here';
    
    authenticate(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INVALID_TOKEN' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should attach user to request for valid token', () => {
    const payload = { userId: 'user1', username: 'testuser' };
    const token = signToken(payload);
    mockReq.headers.authorization = `Bearer ${token}`;
    
    authenticate(mockReq, mockRes, mockNext);
    
    expect(mockReq.user).toBeDefined();
    expect(mockReq.user.userId).toBe(payload.userId);
    expect(mockReq.user.username).toBe(payload.username);
  });
});

describe('RequireParent Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: Mock;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should call next() for parent profile', () => {
    mockReq.user = { userId: 'parent1', username: 'parent', profileType: 'parent' };
    
    requireParent(mockReq, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 401 for missing user', () => {
    requireParent(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 for child profile', () => {
    mockReq.user = { userId: 'child1', username: 'child', profileType: 'child' };
    
    requireParent(mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });
});
