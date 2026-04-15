// Feature flags for selective rollout of risky or experimental features
// Use these sparingly - only for features that may need quick disabling

export const FEATURE_FLAGS = {
  // ===== GAMIFICATION =====
  
  // Load skill tree from database instead of hardcoded values
  // When false: Uses hardcoded SKILL_TREE in kingdom.tsx
  // When true: Loads skills from database
  SKILL_TREE_V2: false,

  // Show trophy unlock notifications/alerts
  // When false: Trophies unlock silently
  // When true: Shows celebration modal when new trophy unlocked
  TROPHY_NOTIFICATIONS: true,

  // Use dynamic streak restore cost formula
  // When false: Static 500 coin cost
  // When true: Cost = min(streak * 50, 1500)
  STREAK_RESTORE_V2: true,

  // ===== SECURITY & ACCESS CONTROL =====
  
  // Block child profiles from using admin actions (bonus/penalty/reset)
  // When false: All profiles can use admin actions
  // When true: Only parent profiles can use admin actions
  PARENT_ACCESS_CONTROL: true,

  // Verify profile ownership on delete/update operations
  // When false: No ownership verification
  // When true: Operations verify resource belongs to current profile
  PROFILE_ISOLATION_CHECKS: true,

  // ===== PERFORMANCE (EXPERIMENTAL) =====
  
  // Use paginated activity feed
  // When false: Loads all activity at once
  // When true: Loads 50 items at a time with infinite scroll
  PAGINATED_ACTIVITY: false,

  // ===== NOTIFICATIONS =====
  
  // Use weekly/monthly notification scheduling (may have platform limitations)
  // When false: Weekly/monthly habits get daily notifications
  // When true: Respects actual frequency for notifications
  WEEKLY_MONTHLY_NOTIFICATIONS: false,

  // ===== DATABASE =====
  
  // Use archived (soft delete) instead of hard delete
  // When false: DELETE removes records permanently
  // When true: UPDATE sets deletedAt timestamp instead
  SOFT_DELETE_ARCHIVE: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] === true;
}

export function getFlagValue<K extends FeatureFlag>(
  flag: K
): (typeof FEATURE_FLAGS)[K] {
  return FEATURE_FLAGS[flag];
}

// Helper to conditionally apply feature behavior
export function withFeatureFlag<T>(
  flag: FeatureFlag,
  whenEnabled: T,
  whenDisabled: T
): T {
  return isEnabled(flag) ? whenEnabled : whenDisabled;
}

// Development helper to override flags (use in development only)
export function setFeatureFlag(flag: FeatureFlag, value: boolean): void {
  if (process.env.NODE_ENV !== "development") {
    console.warn("[FeatureFlags] setFeatureFlag called outside development");
    return;
  }
  (FEATURE_FLAGS as any)[flag] = value;
}
