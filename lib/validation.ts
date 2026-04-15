import { z } from 'zod';

// Validation schemas for data entering the system

export const habitSchema = z.object({
  name: z.string().min(1, 'Habit name is required').max(100, 'Habit name too long'),
  icon: z.string().min(1, 'Icon is required'),
  coinReward: z.number().int().positive('Coin reward must be positive').max(1000, 'Coin reward too high'),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Color must be a valid hex color'),
  frequency: z.enum(['once', 'daily', 'weekly', 'monthly']),
  scheduledTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  profileId: z.string().optional(),
});

export const rewardSchema = z.object({
  name: z.string().min(1, 'Reward name is required').max(100, 'Reward name too long'),
  icon: z.string().min(1, 'Icon is required'),
  cost: z.number().int().positive('Cost must be positive').max(10000, 'Cost too high'),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Color must be a valid hex color'),
  profileId: z.string().optional(),
});

export const completionSchema = z.object({
  habitId: z.string().uuid('Invalid habit ID'),
  habitName: z.string().min(1, 'Habit name is required').max(100, 'Habit name too long'),
  coinReward: z.number().int().positive('Coin reward must be positive'),
  completedAt: z.string().datetime(),
  profileId: z.string().optional(),
});

export const redemptionSchema = z.object({
  rewardId: z.string().uuid('Invalid reward ID'),
  rewardName: z.string().min(1, 'Reward name is required').max(100, 'Reward name too long'),
  cost: z.number().int().positive('Cost must be positive'),
  redeemedAt: z.string().datetime(),
  profileId: z.string().optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1, 'Profile name is required').max(50, 'Profile name too long'),
  type: z.enum(['child', 'parent']),
});

// Type inference for validation schemas
export type HabitInput = z.infer<typeof habitSchema>;
export type RewardInput = z.infer<typeof rewardSchema>;
export type CompletionInput = z.infer<typeof completionSchema>;
export type RedemptionInput = z.infer<typeof redemptionSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

// Validation functions with detailed error messages
export function validateHabitInput(input: unknown): HabitInput {
  const result = habitSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
    throw new Error(`Invalid habit data: ${errors}`);
  }
  return result.data;
}

export function validateRewardInput(input: unknown): RewardInput {
  const result = rewardSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
    throw new Error(`Invalid reward data: ${errors}`);
  }
  return result.data;
}

export function validateCompletionInput(input: unknown): CompletionInput {
  const result = completionSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
    throw new Error(`Invalid completion data: ${errors}`);
  }
  return result.data;
}

export function validateRedemptionInput(input: unknown): RedemptionInput {
  const result = redemptionSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
    throw new Error(`Invalid redemption data: ${errors}`);
  }
  return result.data;
}

export function validateProfileInput(input: unknown): ProfileInput {
  const result = profileSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('; ');
    throw new Error(`Invalid profile data: ${errors}`);
  }
  return result.data;
}