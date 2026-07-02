// Mock expo-modules-core — provides stubs for all core Expo modules
// that reference __DEV__ and native-only APIs at module load time

// Must set before any expo-modules-core file executes
(globalThis as any).__DEV__ = true;

// Stub out the Platform module that reads __DEV__
export const Platform = {
  OS: 'ios',
  Version: '18.0',
};

// Stub out any other core exports that get imported
export const EventEmitter = { addListener: () => ({ remove: () => {} }) };
export const NativeModulesProxy = {};
export const requireNativeModule = () => ({});
export const requireNativeViewManager = () => null;

export default {
  Platform,
  EventEmitter,
  NativeModulesProxy,
  requireNativeModule,
  requireNativeViewManager,
};