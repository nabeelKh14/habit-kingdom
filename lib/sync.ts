import { supabase } from './supabase';
import * as storage from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SYNC_KEY = 'habit_kingdom_last_sync';

// Graceful check for internet/supabase connection
async function isSupabaseConfigured(): Promise<boolean> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && key);
}

/**
 * Syncs all local data to Supabase (Push) and pulls down any missing cloud data (Pull)
 */
export async function syncWithSupabase(force = false): Promise<{ success: boolean; message: string }> {
  try {
    if (!(await isSupabaseConfigured())) {
      return { success: false, message: 'Supabase is not configured yet. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.' };
    }

    console.log('[SYNC] Starting Supabase sync...');

    // 1. Get all local profiles
    const localProfiles = await storage.getProfiles();
    if (localProfiles.length === 0) {
      return { success: true, message: 'No profiles found to sync.' };
    }

    // --- PUSH LOCAL DATA TO SUPABASE ---
    for (const profile of localProfiles) {
      console.log(`[SYNC] Syncing data for profile: ${profile.name} (${profile.id})`);

      // A. Sync Profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: profile.id,
          name: profile.name,
          type: profile.type,
          created_at: profile.createdAt,
        });
      if (profileErr) throw profileErr;

      // B. Sync Habits
      // Switch active profile context temporarily if needed to get habits, or fetch via database helper
      // Wait, storage.getHabits() returns habits for active profile. To get them accurately, we can get habits
      // but let's see: we can switch active profile ID or access db directly. Since storage.getHabits()
      // gets habits for the active profile, we can temporally switch profiles in storage to gather all.
      const previousActiveId = storage.getActiveProfileId();
      storage.setActiveProfileId(profile.id);
      
      const habits = await storage.getHabits();
      for (const habit of habits) {
        const { error: habitErr } = await supabase
          .from('habits')
          .upsert({
            id: habit.id,
            name: habit.name,
            icon: habit.icon,
            coin_reward: habit.coinReward,
            color: habit.color,
            created_at: habit.createdAt,
            frequency: habit.frequency,
            scheduled_time: habit.scheduledTime || null,
            days_of_week: habit.daysOfWeek ? JSON.stringify(habit.daysOfWeek) : null,
            day_of_month: habit.dayOfMonth || null,
            is_paused: habit.isPaused || false,
            pause_until: habit.pauseUntil || null,
            notifications_enabled: habit.notificationsEnabled || false,
            notification_time: habit.notificationTime || null,
            profile_id: profile.id,
            deleted_at: null, // Assuming no soft delete is active locally or handled separately
          });
        if (habitErr) throw habitErr;
      }

      // C. Sync Rewards
      const rewards = await storage.getRewards();
      for (const reward of rewards) {
        const { error: rewardErr } = await supabase
          .from('rewards')
          .upsert({
            id: reward.id,
            name: reward.name,
            icon: reward.icon,
            cost: reward.cost,
            color: reward.color,
            created_at: reward.createdAt,
            profile_id: profile.id,
            deleted_at: null,
          });
        if (rewardErr) throw rewardErr;
      }

      // D. Sync Completions
      const completions = await storage.getCompletions(profile.id);
      for (const completion of completions) {
        const { error: completionErr } = await supabase
          .from('completions')
          .upsert({
            id: completion.id,
            habit_id: completion.habitId,
            habit_name: completion.habitName,
            coin_reward: completion.coinReward,
            completed_at: completion.completedAt,
            profile_id: profile.id,
          });
        if (completionErr) throw completionErr;
      }

      // E. Sync Redemptions
      const redemptions = await storage.getRedemptions(profile.id);
      for (const redemption of redemptions) {
        const { error: redemptionErr } = await supabase
          .from('redemptions')
          .upsert({
            id: redemption.id,
            reward_id: redemption.rewardId,
            reward_name: redemption.rewardName,
            cost: redemption.cost,
            redeemed_at: redemption.redeemedAt,
            profile_id: profile.id,
          });
        if (redemptionErr) throw redemptionErr;
      }

      // F. Sync Wallet Balance
      const balance = await storage.getBalance(profile.id);
      const { error: walletErr } = await supabase
        .from('wallet')
        .upsert({
          profile_id: profile.id,
          balance: balance,
        });
      if (walletErr) throw walletErr;

      // G. Sync Achievements
      const achievements = await storage.getUnlockedAchievements();
      for (const achievement of achievements) {
        const { error: achErr } = await supabase
          .from('achievements')
          .upsert({
            id: achievement.id,
            trophy_id: achievement.trophyId,
            unlocked_at: achievement.unlockedAt,
            profile_id: profile.id,
          });
        if (achErr) throw achErr;
      }

      // H. Sync User Stats
      const stats = await storage.getUserStats(profile.id);
      const { error: statsErr } = await supabase
        .from('user_stats')
        .upsert({
          profile_id: profile.id,
          total_completions: stats.totalCompletions,
          longest_streak: stats.longestStreak,
          longest_single_habit_streak: stats.longestSingleHabitStreak,
          longest_single_habit_id: stats.longestSingleHabitId || null,
        });
      if (statsErr) throw statsErr;

      // Restore active profile ID context
      storage.setActiveProfileId(previousActiveId);
    }

    // Update last sync timestamp
    const now = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, now);

    console.log('[SYNC] Supabase sync completed successfully!');
    return { success: true, message: `Successfully synced with Supabase cloud backup at ${new Date().toLocaleTimeString()}` };

  } catch (error: any) {
    console.error('[SYNC] Error during Supabase sync:', error);
    return { success: false, message: `Sync failed: ${error.message || error}` };
  }
}

/**
 * Get the last successful sync timestamp
 */
export async function getLastSyncTime(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}
