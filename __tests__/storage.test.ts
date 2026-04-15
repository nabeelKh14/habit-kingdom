import * as storage from '../../lib/storage';
import * as db from '../../lib/db';
import * as onboardingStorage from '../../lib/onboarding-storage';

// Mock dependencies
jest.mock('../../lib/db');
jest.mock('../../lib/onboarding-storage');
jest.mock('expo-crypto');

describe('Storage Layer', () => {
  const mockUserId = 'test-user-id';
  const mockProfileId = 'test-profile-id';
  const mockHabitId = 'test-habit-id';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Crypto.randomUUID
    require('expo-crypto').randomUUID.mockReturnValue(mockHabitId);
    
    // Mock getActiveProfileId
    (onboardingStorage.getActiveProfileId as jest.Mock).mockResolvedValue(mockProfileId);
  });

  describe('getHabits', () => {
    it('should return empty array on database error', async () => {
      // Mock database error
      (db.getAllHabits as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const result = await storage.getHabits();
      
      expect(result).toEqual([]);
      expect(db.getAllHabits).toHaveBeenCalledWith(mockProfileId);
    });

    it('should map database rows to habit objects', async () => {
      const mockRows = [
        {
          id: 'habit1',
          name: 'Test Habit',
          icon: 'test-icon',
          coinReward: 10,
          color: '#FF0000',
          createdAt: '2023-01-01T00:00:00.000Z',
          frequency: 'daily',
          scheduledTime: '09:00',
          daysOfWeek: '[1,2,3]', // JSON string
          dayOfMonth: 15,
          notificationsEnabled: 1,
          notificationTime: '08:30',
          isPaused: 0,
          pauseUntil: null,
          profileId: mockProfileId,
        }
      ];
      
      (db.getAllHabits as jest.Mock).mockResolvedValue(mockRows);
      
      const result = await storage.getHabits();
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'habit1',
        name: 'Test Habit',
        icon: 'test-icon',
        coinReward: 10,
        color: '#FF0000',
        frequency: 'daily',
        scheduledTime: '09:00',
        daysOfWeek: [1, 2, 3], // Parsed from JSON
        dayOfMonth: 15,
        notificationsEnabled: true,
        notificationTime: '08:30',
        isPaused: false,
        profileId: mockProfileId,
      });
    });
  });

  describe('saveHabit', () => {
    it('should create a habit with correct defaults', async () => {
      const habitData = {
        name: 'Test Habit',
        icon: 'test-icon',
        coinReward: 10,
        color: '#FF0000',
        createdAt: '2023-01-01T00:00:00.000Z',
      };
      
      (db.insertHabit as jest.Mock).mockResolvedValue(undefined);
      
      const result = await storage.saveHabit(habitData as any);
      
      expect(result).toMatchObject({
        id: mockHabitId,
        name: 'Test Habit',
        icon: 'test-icon',
        coinReward: 10,
        color: '#FF0000',
        createdAt: '2023-01-01T00:00:00.000Z',
        frequency: 'once', // Default
        notificationsEnabled: false, // Default
      });
      
      expect(db.insertHabit).toHaveBeenCalledWith({
        id: mockHabitId,
        name: 'Test Habit',
        icon: 'test-icon',
        coinReward: 10,
        color: '#FF0000',
        createdAt: '2023-01-01T00:00:00.000Z',
        frequency: 'once',
        scheduledTime: undefined,
        daysOfWeek: undefined,
        dayOfMonth: undefined,
        notificationsEnabled: 0,
        notificationTime: undefined,
        profileId: mockProfileId,
      });
    });

    it('should throw error if database insert fails', async () => {
      const habitData = {
        name: 'Test Habit',
        icon: 'test-icon',
        coinReward: 10,
        color: '#FF0000',
        createdAt: '2023-01-01T00:00:00.000Z',
      };
      
      (db.insertHabit as jest.Mock).mockRejectedValue(new Error('Insert failed'));
      
      await expect(storage.saveHabit(habitData as any)).rejects.toThrow('Insert failed');
    });
  });

  describe('completeHabit', () => {
    it('should complete a habit and update stats', async () => {
      const habit = {
        id: mockHabitId,
        name: 'Test Habit',
        coinReward: 10,
        profileId: mockProfileId,
      } as any;
      
      // Mock dependencies
      (db.getWalletBalance as jest.Mock).mockResolvedValue(50);
      (db.insertCompletion as jest.Mock).mockResolvedValue(undefined);
      (db.setWalletBalance as jest.Mock).mockResolvedValue(undefined);
      (db.updateUserStats as jest.Mock).mockResolvedValue(undefined);
      (db.getUserStats as jest.Mock).mockResolvedValue({
        profileId: mockProfileId,
        totalCompletions: 5,
        longestStreak: 3,
        longestSingleHabitStreak: 2,
        longestSingleHabitId: 'other-habit',
      });
      
      const result = await storage.completeHabit(habit);
      
      expect(result).toMatchObject({
        id: mockHabitId,
        habitId: mockHabitId,
        habitName: 'Test Habit',
        coinReward: 10,
      });
      
      // Verify the completion was inserted with correct profileId
      expect(db.insertCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          habitId: mockHabitId,
          habitName: 'Test Habit',
          coinReward: 10,
          profileId: mockProfileId,
        })
      );
      
      // Verify balance was updated (50 + 10 = 60)
      expect(db.setWalletBalance).toHaveBeenCalledWith(60, mockProfileId);
      
      // Verify stats were updated (totalCompletions + 1)
      expect(db.updateUserStats).toHaveBeenCalledWith(
        { totalCompletions: 1 },
        mockProfileId
      );
    });
  });
});

// Test helper functions
describe('Habit Due Today Logic', () => {
  it('should return true for daily habits', () => {
    const habit = {
      frequency: 'daily',
    } as any;
    
    expect(storage.isHabitDueToday(habit)).toBe(true);
  });

  it('should return true for weekly habits on matching day', () => {
    const habit = {
      frequency: 'weekly',
      daysOfWeek: [1], // Monday
    } as any;
    
    // Mock date to be Monday (day 1)
    const originalDate = global.Date;
    global.Date = class extends Date {
      constructor() {
        super();
        // Set to Monday, Jan 2, 2023
        return new originalDate(2023, 0, 2);
      }
    } as any;
    
    try {
      expect(storage.isHabitDueToday(habit)).toBe(true);
    } finally {
      global.Date = originalDate;
    }
  });

  it('should return false for weekly habits on non-matching day', () => {
    const habit = {
      frequency: 'weekly',
      daysOfWeek: [1], // Monday
    } as any;
    
    // Mock date to be Tuesday (day 2)
    const originalDate = global.Date;
    global.Date = class extends Date {
      constructor() {
        super();
        // Set to Tuesday, Jan 3, 2023
        return new originalDate(2023, 0, 3);
      }
    } as any;
    
    try {
      expect(storage.isHabitDueToday(habit)).toBe(false);
    } finally {
      global.Date = originalDate;
    }
  });

  it('should handle monthly habits correctly', () => {
    const habit = {
      frequency: 'monthly',
      dayOfMonth: 15,
    } as any;
    
    // Mock date to be the 15th
    const originalDate = global.Date;
    global.Date = class extends Date {
      constructor() {
        super();
        // Set to Jan 15, 2023
        return new originalDate(2023, 0, 15);
      }
    } as any;
    
    try {
      expect(storage.isHabitDueToday(habit)).toBe(true);
    } finally {
      global.Date = originalDate;
    }
  });
});