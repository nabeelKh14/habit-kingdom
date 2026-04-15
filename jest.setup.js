// jest.setup.js
import '@testing-library/jest-native/extend-expect';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  return {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
    multiGet: jest.fn(),
    multiSet: jest.fn(),
    multiRemove: jest.fn(),
  };
});

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  ...jest.requireActual('expo-notifications'),
  requestPermissionsAsync: jest.fn().mockResValue({ status: 'granted' }),
  getPermissionsAsync: jest.fn().mockResValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResValue('identifier'),
  cancelScheduledNotificationAsync: jest.fn().mockResValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResValue([]),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResValue(undefined),
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  notificationAsync: jest.fn().mockResValue(undefined),
  impactAsync: jest.fn().mockResValue(undefined),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: () => ({}),
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

// Mock expo constants
jest.mock('expo-constants', () => ({
  ...jest.requireActual('expo-constants'),
  manifest: {
    extra: {
      EXPO_PUBLIC_DOMAIN: 'localhost:3000',
    },
  },
}));