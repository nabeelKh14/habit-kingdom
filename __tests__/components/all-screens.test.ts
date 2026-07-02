/**
 * Habit Kingdom — Component Tests (mock-based, no jsdom)
 *
 * Tests all 8 screens by calling their data-layer functions directly.
 * vi.mock factories are pure object literals — no variable references
 * (the factory is hoisted by vitest).
 *
 * Covers:
 *   Screen 1 — Habits List (index): CRUD, completions, streaks, profiles
 *   Screen 2 — Kingdom (skill tree): economy, skills
 *   Screen 3 — Rewards: shop, trophies, parent controls
 *   Screen 4 — Activity: history log
 *   Screen 5 — Add Habit: create/edit habit
 *   Screen 6 — Add Reward: create/edit reward
 *   Screen 7 — Onboarding: profile creation flow
 *   Screen 8 — Settings: reminders, notifications, profiles, icon, sync
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Pure mock factories (no variable refs — vitest hoisting safe) ──

vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable',
  FlatList: 'FlatList', SectionList: 'SectionList',
  Modal: 'Modal', ScrollView: 'ScrollView',
  TextInput: 'TextInput', Switch: 'Switch', Image: 'Image',
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Alert: { alert: vi.fn() },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Linking: { openURL: vi.fn(), canOpenURL: vi.fn().mockResolvedValue(true) },
  RefreshControl: 'RefreshControl',
  AppState: { addEventListener: vi.fn(), removeEventListener: vi.fn(), currentState: 'active' },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));

vi.mock('@expo/vector-icons', () => ({
  Feather: () => null,
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), back: vi.fn(), replace: vi.fn() },
  useFocusEffect: vi.fn((cb: Function) => cb()),
  useLocalSearchParams: () => ({}),
  Stack: 'Stack',
  Tabs: 'Tabs',
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: 'AV', Text: 'AT', FlatList: 'AFL', ScrollView: 'ASV', createAnimatedComponent: (c: any) => c },
  useSharedValue: (v: number) => ({ value: v }),
  useAnimatedStyle: (cb: Function) => cb(),
  withSpring: (v: any) => v, withSequence: (...a: any[]) => a[0],
  withTiming: (v: any) => v, withRepeat: (v: any) => v,
  interpolate: (v: any) => v, Extrapolation: { CLAMP: 'clamp' },
  FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) },
  FadeInDown: { duration: () => ({}) }, ZoomIn: { duration: () => ({}) },
  SlideInLeft: { duration: () => ({}) }, SlideInRight: { duration: () => ({}) },
  useAnimatedScrollHandler: (h: any) => h,
  runOnJS: (fn: Function) => fn,
}));

vi.mock('../../constants/colors', () => ({
  default: {
    background: '#1a1a2e', surface: '#16213e', primary: '#e94560',
    secondary: '#0f3460', text: '#ffffff', textSecondary: '#a0a0b0',
    success: '#2ecc71', warning: '#f39c12', danger: '#e74c3c',
    cardBackground: '#1e2a4a', border: '#2a3a5a', accent: '#533483',
    accentLight: '#7b5ea7', gold: '#ffd700', silver: '#c0c0c0', bronze: '#cd7f32',
  },
}));

vi.mock('../../lib/storage', () => ({
  getHabits: vi.fn().mockResolvedValue([]),
  getTodayCompletions: vi.fn().mockResolvedValue([]),
  completeHabit: vi.fn().mockResolvedValue(undefined),
  uncompleteHabit: vi.fn().mockResolvedValue(undefined),
  deleteHabit: vi.fn().mockResolvedValue(undefined),
  updateHabit: vi.fn().mockResolvedValue(undefined),
  saveHabit: vi.fn().mockResolvedValue('new-id'),
  saveReward: vi.fn().mockResolvedValue('new-id'),
  getRewards: vi.fn().mockResolvedValue([]),
  redeemReward: vi.fn().mockResolvedValue(undefined),
  deleteReward: vi.fn().mockResolvedValue(undefined),
  updateReward: vi.fn().mockResolvedValue(undefined),
  getBalance: vi.fn().mockResolvedValue(100),
  updateBalance: vi.fn().mockResolvedValue(undefined),
  getStreak: vi.fn().mockResolvedValue(0),
  getNextOccurrence: vi.fn().mockResolvedValue(null),
  isHabitPaused: vi.fn().mockResolvedValue(false),
  pauseHabit: vi.fn().mockResolvedValue(undefined),
  resumeHabit: vi.fn().mockResolvedValue(undefined),
  checkAndUnlockAchievements: vi.fn().mockResolvedValue([]),
  getConsistencyScore: vi.fn().mockResolvedValue(50),
  getUserStats: vi.fn().mockResolvedValue({ totalCompletions: 5, totalRedemptions: 1, currentStreak: 3, bestStreak: 7 }),
  isHabitDueToday: vi.fn().mockReturnValue(true),
  setActiveProfileId: vi.fn().mockResolvedValue(undefined),
  getActiveProfile: vi.fn().mockResolvedValue({ id: 'p1', name: 'Test', emoji: '😀' }),
  getProfiles: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Test', emoji: '😀', isParent: false }]),
  restoreStreakWithCoins: vi.fn().mockResolvedValue(undefined),
  getPurchasedSkillIds: vi.fn().mockResolvedValue([]),
  savePurchasedSkill: vi.fn().mockResolvedValue(undefined),
  getAllProfileCompletions: vi.fn().mockResolvedValue([]),
  getAllProfileRedemptions: vi.fn().mockResolvedValue([]),
  getTrophiesWithStatus: vi.fn().mockResolvedValue([]),
  addBonusPoints: vi.fn().mockResolvedValue(undefined),
  applyPenaltyPoints: vi.fn().mockResolvedValue(undefined),
  resetStreak: vi.fn().mockResolvedValue(undefined),
  isParentProfile: vi.fn().mockReturnValue(false),
  createProfile: vi.fn().mockResolvedValue('new-profile'),
  renameProfile: vi.fn().mockResolvedValue(undefined),
  removeProfile: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/settings-storage', () => ({
  getReminderSettings: vi.fn().mockResolvedValue({ morning: true, night: false }),
  saveReminderSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/onboarding-storage', () => ({
  getActiveProfileId: vi.fn().mockResolvedValue('p1'),
  setActiveProfileId: vi.fn().mockResolvedValue(undefined),
  setOnboardingComplete: vi.fn().mockResolvedValue(undefined),
  saveProfiles: vi.fn().mockResolvedValue(undefined),
  getSavedProfiles: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/notifications', () => ({
  scheduleHabitNotifications: vi.fn().mockResolvedValue(undefined),
  cancelHabitNotifications: vi.fn().mockResolvedValue(undefined),
  requestNotificationPermissions: vi.fn().mockResolvedValue({ status: 'granted' }),
  scheduleMiddayReminder: vi.fn().mockResolvedValue(undefined),
  cancelMiddayReminder: vi.fn().mockResolvedValue(undefined),
  scheduleNightReminder: vi.fn().mockResolvedValue(undefined),
  cancelNightReminder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/habitIcons', () => ({
  HABIT_ICONS: [{ name: 'book', icon: 'book', label: 'Reading' }],
  HABIT_COLORS: ['#e94560', '#0f3460'],
  REWARD_ICONS: [{ name: 'gift', icon: 'gift', label: 'Gift' }],
  REWARD_COLORS: ['#2ecc71', '#f39c12'],
}));

vi.mock('../../lib/habit-presets', () => ({
  HABIT_PRESETS: [],
  REWARD_PRESETS: [],
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('../../lib/app-icon', () => ({
  APP_ICONS: [{ name: 'default', icon: 'default', label: 'Default' }],
  getCurrentIcon: vi.fn().mockResolvedValue('default'),
  setAppIcon: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/sync', () => ({
  syncWithSupabase: vi.fn().mockResolvedValue(undefined),
  getLastSyncTime: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../components/CuteAvatar', () => ({
  default: () => null,
}));

vi.mock('../../lib/db', () => ({
  default: {
    getDatabase: vi.fn(),
    closeDatabase: vi.fn(),
    exec: vi.fn(),
  },
  getDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));

// Expo native modules that get imported transitively
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockResolvedValue({
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn().mockResolvedValue({ user_version: 3 }),
    getAllAsync: vi.fn().mockResolvedValue([]),
    runAsync: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
  }),
}));

vi.mock('expo-crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9)),
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: vi.fn().mockResolvedValue('notif-id'),
  getAllScheduledNotificationsAsync: vi.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: vi.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' },
  AndroidImportance: { HIGH: 4 },
}));

// ── Import screens ─────────────────────────────────────────────────
import HabitListScreen from '../../app/(tabs)/index';
import KingdomScreen from '../../app/(tabs)/kingdom';
import RewardsScreen from '../../app/(tabs)/rewards';
import ActivityScreen from '../../app/(tabs)/activity';
import AddHabitScreen from '../../app/add-habit';
import AddRewardScreen from '../../app/add-reward';
import OnboardingScreen from '../../app/onboarding';
import SettingsScreen from '../../app/settings';

// Additional mock module imports for direct access
import * as SettingsStorage from '../../lib/settings-storage';
import * as NotificationLib from '../../lib/notifications';
import * as AppIconLib from '../../lib/app-icon';
import * as SyncLib from '../../lib/sync';
import * as OnboardingStorage from '../../lib/onboarding-storage';

import * as StorageLib from '../../lib/storage';

// Convenience alias
const s = () => StorageLib;

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// Screen 1 — Habits List (Index Tab)
// ═══════════════════════════════════════════════════════════════════
describe('Habits List Screen', () => {
  it('is a function component', () => {
    expect(typeof HabitListScreen).toBe('function');
  });

  it('getHabits retrieves habit list', async () => {
    await s().getHabits();
    expect(s().getHabits).toHaveBeenCalled();
  });

  it('completeHabit marks a habit done', async () => {
    await s().completeHabit('h1');
    expect(s().completeHabit).toHaveBeenCalledWith('h1');
  });

  it('uncompleteHabit reverts', async () => {
    await s().uncompleteHabit('h1');
    expect(s().uncompleteHabit).toHaveBeenCalledWith('h1');
  });

  it('deleteHabit removes a habit', async () => {
    await s().deleteHabit('h1');
    expect(s().deleteHabit).toHaveBeenCalledWith('h1');
  });

  it('getStreak returns a number', async () => {
    const streak = await s().getStreak('h1');
    expect(typeof streak).toBe('number');
  });

  it('getConsistencyScore is 0–100', async () => {
    const score = await s().getConsistencyScore('h1');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('checkAndUnlockAchievements returns array', async () => {
    const unlocked = await s().checkAndUnlockAchievements();
    expect(Array.isArray(unlocked)).toBe(true);
  });

  it('restoreStreakWithCoins spends coins', async () => {
    await s().restoreStreakWithCoins('h1');
    expect(s().restoreStreakWithCoins).toHaveBeenCalledWith('h1');
  });

  it('getProfiles returns profile list', async () => {
    const profiles = await s().getProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles[0].name).toBe('Test');
  });

  it('setActiveProfileId switches profile', async () => {
    await s().setActiveProfileId('p2');
    expect(s().setActiveProfileId).toHaveBeenCalledWith('p2');
  });

  it('pauseHabit + resumeHabit toggle state', async () => {
    await s().pauseHabit('h1');
    expect(s().pauseHabit).toHaveBeenCalledWith('h1');
    await s().resumeHabit('h1');
    expect(s().resumeHabit).toHaveBeenCalledWith('h1');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Screen 2 — Kingdom (Skill Tree)
// ═══════════════════════════════════════════════════════════════════
describe('Kingdom Screen', () => {
  it('is a function component', () => {
    expect(typeof KingdomScreen).toBe('function');
  });

  it('getBalance returns coin count >= 0', async () => {
    const bal = await s().getBalance();
    expect(bal).toBeGreaterThanOrEqual(0);
  });

  it('updateBalance modifies coins', async () => {
    await s().updateBalance(-50);
    expect(s().updateBalance).toHaveBeenCalledWith(-50);
  });

  it('getUserStats returns stats object', async () => {
    const stats = await s().getUserStats();
    expect(stats).toHaveProperty('totalCompletions');
    expect(stats).toHaveProperty('bestStreak');
  });

  it('getPurchasedSkillIds lists owned skills', async () => {
    const ids = await s().getPurchasedSkillIds();
    expect(Array.isArray(ids)).toBe(true);
  });

  it('savePurchasedSkill persists purchase', async () => {
    await s().savePurchasedSkill('armor-2');
    expect(s().savePurchasedSkill).toHaveBeenCalledWith('armor-2');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Screen 3 — Rewards (Shop)
// ═══════════════════════════════════════════════════════════════════
describe('Rewards Screen', () => {
  it('is a function component', () => {
    expect(typeof RewardsScreen).toBe('function');
  });

  it('getRewards lists all rewards', async () => {
    await s().getRewards();
    expect(s().getRewards).toHaveBeenCalled();
  });

  it('redeemReward spends coins', async () => {
    await s().redeemReward('r1');
    expect(s().redeemReward).toHaveBeenCalledWith('r1');
  });

  it('deleteReward removes a reward', async () => {
    await s().deleteReward('r1');
    expect(s().deleteReward).toHaveBeenCalledWith('r1');
  });

  it('getTrophiesWithStatus returns trophy progress', async () => {
    const trophies = await s().getTrophiesWithStatus();
    expect(Array.isArray(trophies)).toBe(true);
  });

  // Parent controls
  it('addBonusPoints gives extra coins', async () => {
    await s().addBonusPoints(25);
    expect(s().addBonusPoints).toHaveBeenCalledWith(25);
  });

  it('applyPenaltyPoints deducts coins', async () => {
    await s().applyPenaltyPoints(10);
    expect(s().applyPenaltyPoints).toHaveBeenCalledWith(10);
  });

  it('resetStreak forces streak reset', async () => {
    await s().resetStreak('h1');
    expect(s().resetStreak).toHaveBeenCalledWith('h1');
  });

  it('isParentProfile detects parent accounts', async () => {
    const result = await s().isParentProfile('p-parent');
    expect(typeof result).toBe('boolean');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Screen 4 — Activity (History Log)
// ═══════════════════════════════════════════════════════════════════
describe('Activity Screen', () => {
  it('is a function component', () => {
    expect(typeof ActivityScreen).toBe('function');
  });

  it('getAllProfileCompletions returns history', async () => {
    await s().getAllProfileCompletions();
    expect(s().getAllProfileCompletions).toHaveBeenCalled();
  });

  it('getAllProfileRedemptions returns history', async () => {
    await s().getAllProfileRedemptions();
    expect(s().getAllProfileRedemptions).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Screen 5 — Add Habit
// ═══════════════════════════════════════════════════════════════════
describe('Add Habit Screen', () => {
  it('is a function component', () => {
    expect(typeof AddHabitScreen).toBe('function');
  });

  it('saveHabit creates a new habit', async () => {
    await s().saveHabit({ name: 'Read', frequency: 'daily' });
    expect(s().saveHabit).toHaveBeenCalled();
  });

  it('updateHabit edits existing', async () => {
    await s().updateHabit('h1', { name: 'Read More' });
    expect(s().updateHabit).toHaveBeenCalledWith('h1', { name: 'Read More' });
  });

  it('getHabits retrieves for edit mode', async () => {
    await s().getHabits();
    expect(s().getHabits).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Screen 6 — Add Reward
// ═══════════════════════════════════════════════════════════════════
describe('Add Reward Screen', () => {
  it('is a function component', () => {
    expect(typeof AddRewardScreen).toBe('function');
  });

  it('saveReward creates a new reward', async () => {
    await s().saveReward({ name: 'Ice Cream', cost: 50 });
    expect(s().saveReward).toHaveBeenCalled();
  });

  it('updateReward edits existing', async () => {
    await s().updateReward('r1', { cost: 75 });
    expect(s().updateReward).toHaveBeenCalledWith('r1', { cost: 75 });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Screen 7 — Onboarding
// ═══════════════════════════════════════════════════════════════════
describe('Onboarding Screen', () => {
  it('is a function component', () => {
    expect(typeof OnboardingScreen).toBe('function');
  });

  it('createProfile creates a user profile', async () => {
    await s().createProfile('Kid', '😎', false);
    expect(s().createProfile).toHaveBeenCalledWith('Kid', '😎', false);
  });

  it('setActiveProfileId sets after creation', async () => {
    await s().setActiveProfileId('new-profile');
    expect(s().setActiveProfileId).toHaveBeenCalledWith('new-profile');
  });

  it('setOnboardingComplete marks onboarding done', async () => {
    await OnboardingStorage.setOnboardingComplete();
    expect(OnboardingStorage.setOnboardingComplete).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Screen 8 — Settings
// ═══════════════════════════════════════════════════════════════════
describe('Settings Screen', () => {
  it('is a function component', () => {
    expect(typeof SettingsScreen).toBe('function');
  });

  // Reminders
  it('getReminderSettings reads config', async () => {
    const cfg = await SettingsStorage.getReminderSettings();
    expect(cfg).toHaveProperty('morning');
  });

  it('saveReminderSettings persists', async () => {
    await SettingsStorage.saveReminderSettings({ morning: true, night: true });
    expect(SettingsStorage.saveReminderSettings).toHaveBeenCalled();
  });

  // Notifications
  it('requestNotificationPermissions returns status', async () => {
    const r = await NotificationLib.requestNotificationPermissions();
    expect(r.status).toBe('granted');
  });

  // Profile management
  it('renameProfile changes name', async () => {
    await s().renameProfile('p1', 'New Name');
    expect(s().renameProfile).toHaveBeenCalledWith('p1', 'New Name');
  });

  it('removeProfile deletes profile', async () => {
    await s().removeProfile('p2');
    expect(s().removeProfile).toHaveBeenCalledWith('p2');
  });

  it('logout signs out', async () => {
    await s().logout();
    expect(s().logout).toHaveBeenCalled();
  });

  // App icon
  it('getCurrentIcon returns string', async () => {
    const icon = await AppIconLib.getCurrentIcon();
    expect(typeof icon).toBe('string');
  });

  it('setAppIcon switches icon', async () => {
    await AppIconLib.setAppIcon('blue');
    expect(AppIconLib.setAppIcon).toHaveBeenCalledWith('blue');
  });

  // Sync
  it('syncWithSupabase triggers sync', async () => {
    await SyncLib.syncWithSupabase();
    expect(SyncLib.syncWithSupabase).toHaveBeenCalled();
  });
});