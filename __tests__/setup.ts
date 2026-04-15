import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

// Mock expo-sqlite
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockResolvedValue({
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn().mockResolvedValue({ user_version: 3 }),
    getAllAsync: vi.fn().mockResolvedValue([]),
    runAsync: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
  }),
}));

// Mock expo-crypto
vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

// Mock expo-notifications
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: vi.fn().mockResolvedValue('notification-id'),
  getAllScheduledNotificationsAsync: vi.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: vi.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
  },
  AndroidImportance: {
    HIGH: 4,
  },
}));

// Global test utilities
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Re-export for convenience
export { vi };
