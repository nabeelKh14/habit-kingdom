import { describe, it, expect, vi, afterEach } from 'vitest';

// Import the feature flags module
import {
  FEATURE_FLAGS,
  isEnabled,
  getFlagValue,
  withFeatureFlag,
  setFeatureFlag,
} from '../../lib/feature-flags';

// Save original flags
const originalFlags = { ...FEATURE_FLAGS };

describe('Feature Flags', () => {
  afterEach(() => {
    // Restore original flags after each test
    Object.assign(FEATURE_FLAGS, originalFlags);
  });

  describe('isEnabled', () => {
    it('should return true for flags set to true', () => {
      expect(isEnabled('TROPHY_NOTIFICATIONS')).toBe(true);
    });

    it('should return false for flags set to false', () => {
      expect(isEnabled('SKILL_TREE_V2')).toBe(false);
    });
  });

  describe('getFlagValue', () => {
    it('should return the flag value', () => {
      expect(getFlagValue('TROPHY_NOTIFICATIONS')).toBe(true);
      expect(getFlagValue('SKILL_TREE_V2')).toBe(false);
    });
  });

  describe('withFeatureFlag', () => {
    it('should return whenEnabled when flag is true', () => {
      const result = withFeatureFlag('TROPHY_NOTIFICATIONS', 'enabled', 'disabled');
      expect(result).toBe('enabled');
    });

    it('should return whenDisabled when flag is false', () => {
      const result = withFeatureFlag('SKILL_TREE_V2', 'enabled', 'disabled');
      expect(result).toBe('disabled');
    });
  });
});

describe('Security Flags', () => {
  it('PARENT_ACCESS_CONTROL should be true by default', () => {
    expect(FEATURE_FLAGS.PARENT_ACCESS_CONTROL).toBe(true);
  });

  it('PROFILE_ISOLATION_CHECKS should be true by default', () => {
    expect(FEATURE_FLAGS.PROFILE_ISOLATION_CHECKS).toBe(true);
  });
});

describe('Performance Flags', () => {
  it('PAGINATED_ACTIVITY should be false by default', () => {
    expect(FEATURE_FLAGS.PAGINATED_ACTIVITY).toBe(false);
  });
});

describe('Database Flags', () => {
  it('SOFT_DELETE_ARCHIVE should be true by default', () => {
    expect(FEATURE_FLAGS.SOFT_DELETE_ARCHIVE).toBe(true);
  });
});
