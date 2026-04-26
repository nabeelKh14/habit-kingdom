import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Colors from "../../constants/colors";
import {
  getHabits,
  getTodayCompletions,
  completeHabit,
  uncompleteHabit,
  deleteHabit,
  updateHabit,
  getBalance,
  getStreak,
  getNextOccurrence,
  isHabitPaused,
  pauseHabit,
  resumeHabit,
  checkAndUnlockAchievements,
  getConsistencyScore,
  getUserStats,
  isHabitDueToday,
  setActiveProfileId,
  getProfiles,
  getActiveProfile,
  type Habit,
  type Profile,
  restoreStreakWithCoins,
} from "../../lib/storage";
import { getActiveProfileId, setActiveProfileId as saveActiveProfileId } from "../../lib/onboarding-storage";
import { HABIT_ICONS } from "../../lib/habitIcons";
import * as db from "../../lib/db";
import { requestNotificationPermissions, scheduleHabitNotifications, cancelHabitNotifications } from "../../lib/notifications";

interface HabitWithState extends Habit {
  completedToday: boolean;
  streak: number;
  nextOccurrence?: Date;
  isPaused: boolean | undefined;
  notificationsEnabled?: boolean;
}

function formatScheduledTime(time: string | undefined): string {
  if (!time) return '';
  
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function getFrequencyLabel(frequency: string | undefined): string {
  switch (frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'once':
    default:
      return 'One-time';
  }
}

function HabitCard({
  habit,
  onComplete,
  onUncomplete,
  onDelete,
  onShowPauseModal,
  onResume,
  onToggleNotifications,
  onEdit,
}: {
  habit: HabitWithState;
  onComplete: (h: Habit) => void;
  onUncomplete: (habit: Habit) => void;
  onDelete: (id: string) => void;
  onShowPauseModal: (id: string, name: string) => void;
  onResume: (id: string) => void;
  onToggleNotifications: (h: Habit, enabled: boolean) => void;
  onEdit: (h: HabitWithState) => void;
}) {
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(habit.completedToday ? 1 : 0);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const handlePress = () => {
    if (habit.isPaused) return;
    
    // Toggle: if completed today, uncomplete it; otherwise complete it
    if (habit.completedToday) {
      scale.value = withSequence(
        withSpring(0.95, { damping: 15 }),
        withSpring(1, { damping: 10 })
      );
      checkScale.value = withTiming(0, { duration: 200 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onUncomplete(habit);
    } else {
      scale.value = withSequence(
        withSpring(0.95, { damping: 15 }),
        withSpring(1, { damping: 10 })
      );
      checkScale.value = withSpring(1, { damping: 12 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete(habit);
    }
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Habit", `Remove "${habit.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(habit.id),
      },
    ]);
  };

  const handlePausePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onShowPauseModal(habit.id, habit.name);
  };

  const handleResumePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Resume Habit",
      `Resume "${habit.name}" now?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Resume", onPress: () => onResume(habit.id) },
      ]
    );
  };

  const handleEditPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEdit(habit);
  };

  const scheduledTimeFormatted = formatScheduledTime(habit.scheduledTime);
  const frequencyLabel = getFrequencyLabel(habit.frequency);

  return (
    <Animated.View style={cardStyle}>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={[
          styles.habitCard,
          habit.completedToday && styles.habitCardCompleted,
          habit.isPaused && styles.habitCardPaused,
        ]}
      >
        <View style={[styles.habitIconContainer, { backgroundColor: habit.color + "18" }]}>
          {HABIT_ICONS.find(i => i.name === habit.icon)?.library === "ionicons" ? (
            <Ionicons
              name={habit.icon as any}
              size={22}
              color={habit.isPaused ? Colors.textLight : habit.color}
            />
          ) : (
            <Feather
              name={habit.icon as any}
              size={22}
              color={habit.isPaused ? Colors.textLight : habit.color}
            />
          )}
        </View>
        <View style={styles.habitInfo}>
          <Text
            numberOfLines={1}
            style={[
              styles.habitName,
              habit.completedToday && styles.habitNameCompleted,
              habit.isPaused && styles.habitNamePaused,
            ]}
          >
            {habit.name}
          </Text>
          <View style={styles.habitMeta}>
            {habit.isPaused ? (
              <View style={styles.pausedBadge}>
                <Ionicons name="pause" size={10} color={Colors.warning} />
                <Text style={styles.pausedText}>Paused</Text>
              </View>
            ) : (
              <>
                <View style={styles.frequencyBadge}>
                  <Text style={styles.frequencyText}>{frequencyLabel}</Text>
                </View>
                {scheduledTimeFormatted ? (
                  <View style={styles.timeBadge}>
                    <Ionicons name="time-outline" size={11} color={Colors.textSecondary} />
                    <Text style={styles.timeText} numberOfLines={1}>{scheduledTimeFormatted}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
          <View style={styles.habitMetaSecond}>
            {!habit.isPaused && (
              <View style={styles.streakContainer}>
                <Ionicons name="flame" size={13} color={Colors.accent} />
                <Text style={styles.habitStreak}>{habit.streak} day streak</Text>
              </View>
            )}
            <View style={styles.coinBadge}>
              <Ionicons name="diamond" size={14} color={habit.isPaused ? Colors.textLight : Colors.accent} />
              <Text style={[styles.coinText, habit.isPaused && styles.coinTextPaused]}>
                +{habit.coinReward}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.habitActions}>
          {habit.isPaused ? (
            <Pressable
              onPress={handleResumePress}
              style={styles.actionButton}
            >
              <Ionicons name="play" size={16} color={Colors.success} />
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handlePausePress}
                style={styles.actionButton}
              >
                <Ionicons name="pause" size={16} color={Colors.textSecondary} />
              </Pressable>
              {habit.frequency !== 'once' && (
                <Pressable
                  onPress={() => onToggleNotifications(habit, !habit.notificationsEnabled)}
                  style={styles.actionButton}
                >
                  <Ionicons 
                    name={habit.notificationsEnabled ? "notifications" : "notifications-off-outline"} 
                    size={16} 
                    color={habit.notificationsEnabled ? Colors.primary : Colors.textSecondary} 
                  />
                </Pressable>
              )}
              <Pressable
                onPress={handleEditPress}
                style={styles.actionButton}
              >
                <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
              </Pressable>
            </>
          )}
          <View
            style={[
              styles.checkCircle,
              habit.completedToday && { backgroundColor: Colors.success, borderColor: Colors.success },
            ]}
          >
            {habit.completedToday ? (
              <Animated.View style={checkStyle}>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </Animated.View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const [habits, setHabits] = useState<HabitWithState[]>([]);
  const [allHabits, setAllHabits] = useState<Habit[]>([]);
  const [habitFilter, setHabitFilter] = useState<'today' | 'all'>('today');
  const [points, setPoints] = useState(0);
  const [consistencyScore, setConsistencyScore] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  // Streak restore modal
  const [streakRestoreVisible, setStreakRestoreVisible] = useState(false);

  // Pause modal state
  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [pauseHabitId, setPauseHabitId] = useState<string | null>(null);
  const [pauseHabitName, setPauseHabitName] = useState('');
  const [selectedPauseDays, setSelectedPauseDays] = useState(1);

  const [profileStatsList, setProfileStatsList] = useState<{
    profile: Profile;
    points: number;
    consistencyScore: number;
    longestStreak: number;
  }[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [allHabits, todayCompletions, pts, consistency, stats, profileList] = await Promise.all([
        getHabits(),
        getTodayCompletions(),
        getBalance(),
        getConsistencyScore(),
        getUserStats(),
        getProfiles(),
      ]);

      // Fetch stats for all profiles
      const allStats = await Promise.all(
        profileList.map(async (p) => {
          const pPts = await getBalance(p.id);
          const pConsistency = await getConsistencyScore(p.id);
          const pStats = await getUserStats(p.id);
          return {
            profile: p,
            points: pPts,
            consistencyScore: pConsistency,
            longestStreak: pStats.longestStreak,
          };
        })
      );
      setProfileStatsList(allStats);

      const completedIds = new Set(todayCompletions.map((c) => c.habitId));

      // Filter based on selected tab
      const visibleHabits = allHabits.filter((habit) => {
        if (habitFilter === 'today') {
          // Show today's habits only (not paused)
          return !isHabitPaused(habit) && isHabitDueToday(habit);
        } else {
          // Show all habits including paused
          return true;
        }
      });

      // Store all habits for counting
      setAllHabits(allHabits);

      const habitsWithState: HabitWithState[] = await Promise.all(
        visibleHabits.map(async (h) => ({
          ...h,
          completedToday: completedIds.has(h.id),
          streak: await getStreak(h.id),
          nextOccurrence: getNextOccurrence(h),
          isPaused: isHabitPaused(h),
        }))
      );

      setHabits(habitsWithState);
      setPoints(pts);
      setConsistencyScore(consistency);
      setLongestStreak(stats.longestStreak);
      setProfiles(profileList);
      
      // Find active profile
      const current = await getActiveProfile() || profileList[0] || null;
      setActiveProfile(current);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load habits. Please try again.');
      setLoading(false);
    }
  }, [habitFilter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      console.error('Error refreshing habits:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleComplete = async (habit: Habit) => {
    try {
      await completeHabit(habit);
      
      // Check and unlock achievements
      const currentStreak = await getStreak(habit.id);
      const newAchievements = await checkAndUnlockAchievements(habit, currentStreak);
      
      // Show celebration for new achievements
      if (newAchievements.length > 0) {
        const achievementList = newAchievements.map(a => `${a.emoji} ${a.title}`).join('\n• ');
        Alert.alert(
          '🎉 Achievement Unlocked!',
          `You earned:\n• ${achievementList}`,
          [{ text: 'Awesome!', style: 'default' }]
        );
      }
      
      await loadData();
    } catch (error) {
      console.error('Error completing habit:', error);
      Alert.alert('Error', 'Failed to complete habit. Please try again.');
    }
  };

  const handleUncomplete = async (habit: Habit) => {
    try {
      await uncompleteHabit(habit.id, habit.profileId);
      await loadData();
    } catch (error) {
      console.error('Error uncompleting habit:', error);
      Alert.alert('Error', 'Failed to uncomplete habit. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteHabit(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting habit:', error);
      Alert.alert('Error', 'Failed to delete habit. Please try again.');
    }
  };

  const handlePause = async (id: string, days: number) => {
    try {
      await pauseHabit(id, days);
      await loadData();
    } catch (error) {
      console.error('Error pausing habit:', error);
      Alert.alert('Error', 'Failed to pause habit. Please try again.');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await resumeHabit(id);
      await loadData();
    } catch (error) {
      console.error('Error resuming habit:', error);
      Alert.alert('Error', 'Failed to resume habit. Please try again.');
    }
  };

  const handleShowPauseModal = (id: string, name: string) => {
    setPauseHabitId(id);
    setPauseHabitName(name);
    setSelectedPauseDays(1);
    setPauseModalVisible(true);
  };

  const handleConfirmPause = async () => {
    if (!pauseHabitId) return;
    try {
      await pauseHabit(pauseHabitId, selectedPauseDays);
      setPauseModalVisible(false);
      await loadData();
    } catch (error) {
      console.error('Error pausing habit:', error);
      Alert.alert('Error', 'Failed to pause habit. Please try again.');
    }
  };

  const handleEdit = (habit: HabitWithState) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/add-habit?id=${habit.id}`);
  };

  const handleSwitchProfile = async (profile: Profile) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveProfileId(profile.id);
    await saveActiveProfileId(profile.id);
    setActiveProfile(profile);
    setProfileMenuVisible(false);
    await loadData();
  };

  const STREAK_RESTORE_COST = 500;

  const handleRestoreStreak = async () => {
    if (points < STREAK_RESTORE_COST) {
      Alert.alert('Not Enough Coins', `You need ${STREAK_RESTORE_COST} coins to restore your streak. You have ${points} coins.`);
      return;
    }
    Alert.alert(
      'Restore Streak?',
      `Spend ${STREAK_RESTORE_COST} coins to restore your longest streak?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            const success = await restoreStreakWithCoins(STREAK_RESTORE_COST);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setStreakRestoreVisible(false);
              await loadData();
            } else {
              Alert.alert('Error', 'Failed to restore streak.');
            }
          },
        },
      ]
    );
  };

  const handleToggleNotifications = async (habit: Habit, enabled: boolean) => {
    try {
      // Request permissions if enabling
      if (enabled) {
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          Alert.alert(
            "Permission Required",
            "Please enable notifications in your device settings to receive habit reminders."
          );
          return;
        }
      }

      // Use existing notificationTime or default to "09:00"
      const notificationTime = habit.notificationTime || "09:00";
      
      // Update the habit in the database with both enabled state and time
      await db.updateHabit({
        id: habit.id,
        notificationsEnabled: enabled ? 1 : 0,
        notificationTime: enabled ? notificationTime : undefined,
      });

      // Update notifications
      const updatedHabit: Habit = {
        ...habit,
        notificationsEnabled: enabled,
        notificationTime: enabled ? notificationTime : undefined,
      };

      if (enabled) {
        await scheduleHabitNotifications(updatedHabit);
      } else {
        await cancelHabitNotifications(habit.id);
      }

      await loadData();
    } catch (error) {
      console.error('Error toggling notifications:', error);
      Alert.alert("Error", "Failed to update notification settings.");
    }
  };

  const completedCount = habits.filter((h) => h.completedToday).length;
  const activeHabits = habits.filter((h) => !h.isPaused);
  const progress = activeHabits.length > 0 ? completedCount / activeHabits.length : 0;

  // Get today's habits count for subtitle
  const todayHabitsCount = allHabits ? allHabits.filter((h) => !isHabitPaused(h) && isHabitDueToday(h)).length : 0;
  const allHabitsCount = allHabits ? allHabits.length : 0;

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setProfileMenuVisible(true);
            }}
            style={styles.profileButton}
          >
            <View style={styles.profileAvatar}>
              <Ionicons name={activeProfile?.type === 'parent' ? 'person' : 'happy'} size={18} color="#fff" />
            </View>
            <Text style={styles.profileName}>{activeProfile?.name || 'Profile'}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
          </Pressable>
          <Text style={styles.subtitle}>
            {habitFilter === 'today' 
              ? `${completedCount}/${todayHabitsCount} completed today`
              : `${completedCount}/${allHabitsCount} completed total`}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/add-habit");
            }}
            style={styles.addButton}
          >
            <Ionicons name="add" size={22} color={Colors.primary} />
            <Text style={styles.addButtonText}>Add Habit</Text>
          </Pressable>
        </View>
      </View>

      {/* Green Header Cards - Multiple Profiles */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        style={{ marginBottom: 16, flexGrow: 0 }}
      >
        {profileStatsList.map((stat) => (
          <View key={stat.profile.id} style={[styles.greenHeaderCard, { marginHorizontal: 0, marginBottom: 0, width: profileStatsList.length > 1 ? Dimensions.get('window').width - 60 : Dimensions.get('window').width - 40 }]}>
            <View style={styles.greenHeaderGradient}>
              <View style={styles.greenHeaderTop}>
                <View style={styles.greenHeaderLeft}>
                  <Text style={styles.greenHeaderLabel}>{stat.profile.name}s Points</Text>
                  <View style={styles.greenHeaderBalanceRow}>
                    <Ionicons name="diamond" size={24} color="#FBBF24" />
                    <Text style={styles.greenHeaderBalance}>{stat.points}</Text>
                  </View>
                </View>
                <View style={styles.greenHeaderRight}>
                  <Text style={styles.greenHeaderLabel}>Consistency</Text>
                  <View style={styles.greenHeaderScoreRow}>
                    <Ionicons name="trending-up" size={20} color="#6EE7B7" />
                    <Text style={styles.greenHeaderScore}>{stat.consistencyScore}%</Text>
                  </View>
                </View>
              </View>
              <View style={styles.greenHeaderBottom}>
                <Pressable
                  style={styles.greenHeaderStreak}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setStreakRestoreVisible(true);
                  }}
                >
                  <Ionicons name="flame" size={16} color="#FBBF24" />
                  <Text style={styles.greenHeaderStreakText}>Longest streak: {stat.longestStreak} days</Text>
                  <Ionicons name="shield-checkmark" size={14} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {activeHabits.length > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%` },
              ]}
            />
          </View>
        </View>
      )}

      <View style={styles.filterContainer}>
        <Pressable
          onPress={() => setHabitFilter('today')}
          style={[
            styles.filterButton,
            habitFilter === 'today' && styles.filterButtonActive,
          ]}
        >
          <Text style={[
            styles.filterButtonText,
            habitFilter === 'today' && styles.filterButtonTextActive,
          ]}>
            Today&apos;s Habits
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setHabitFilter('all')}
          style={[
            styles.filterButton,
            habitFilter === 'all' && styles.filterButtonActive,
          ]}
        >
          <Text style={[
            styles.filterButtonText,
            habitFilter === 'all' && styles.filterButtonTextActive,
          ]}>
            All Habits
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={habits}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <HabitCard
            habit={item}
            onComplete={handleComplete}
            onUncomplete={handleUncomplete}
            onDelete={handleDelete}
            onShowPauseModal={handleShowPauseModal}
            onResume={handleResume}
            onToggleNotifications={handleToggleNotifications}
            onEdit={handleEdit}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === "web" 
            ? { paddingBottom: 34 + 60 }
            : { paddingBottom: 60 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        scrollEnabled={!!habits.length}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No habits yet</Text>
              <Text style={styles.emptyText}>
                Tap the + button to add your first habit
              </Text>
            </View>
          )
        }
      />

      {/* Profile Menu Modal */}
      <Modal
        visible={profileMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <Pressable
          style={styles.profileModalOverlay}
          onPress={() => setProfileMenuVisible(false)}
        >
          <View style={styles.profileModalContent}>
            <View style={styles.profileModalHandle} />
            <Text style={styles.profileModalTitle}>Switch Profile</Text>
            
            {profiles.map((profile) => (
              <Pressable
                key={profile.id}
                onPress={() => handleSwitchProfile(profile)}
                style={[
                  styles.profileOption,
                  activeProfile?.id === profile.id && styles.profileOptionActive,
                ]}
              >
                <View style={[
                  styles.profileOptionAvatar,
                  { backgroundColor: profile.type === 'child' ? Colors.primary : Colors.primaryDark },
                ]}>
                  <Ionicons name={profile.type === 'child' ? 'happy' : 'person'} size={22} color="#fff" />
                </View>
                <View style={styles.profileOptionInfo}>
                  <Text style={styles.profileOptionName}>{profile.name}</Text>
                  <Text style={styles.profileOptionType}>{profile.type === 'child' ? 'Child' : 'Parent'}</Text>
                </View>
                {activeProfile?.id === profile.id && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                )}
              </Pressable>
            ))}

            <View style={styles.profileMenuDivider} />

            <Pressable
              onPress={() => {
                setProfileMenuVisible(false);
                router.push("/settings");
              }}
              style={styles.profileMenuItem}
            >
              <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
              <Text style={styles.profileMenuItemText}>Settings</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Streak Restore Modal */}
      <Modal
        visible={streakRestoreVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStreakRestoreVisible(false)}
      >
        <Pressable
          style={styles.streakModalOverlay}
          onPress={() => setStreakRestoreVisible(false)}
        >
          <View style={styles.streakModalContent}>
            <View style={styles.streakModalHandle} />
            <Ionicons name="shield-checkmark" size={48} color={Colors.primary} style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.streakModalTitle}>Restore Streak</Text>
            <Text style={styles.streakModalDescription}>
              Did your streak break? Spend {STREAK_RESTORE_COST} coins to restore and protect your longest streak!
            </Text>
            <View style={styles.streakModalInfo}>
              <View style={styles.streakModalInfoRow}>
                <Ionicons name="flame" size={20} color={Colors.accent} />
                <Text style={styles.streakModalInfoText}>Current longest streak: {longestStreak} days</Text>
              </View>
              <View style={styles.streakModalInfoRow}>
                <Ionicons name="diamond" size={20} color={Colors.accent} />
                <Text style={styles.streakModalInfoText}>Your coins: {points}</Text>
              </View>
            </View>
            <Pressable
              onPress={handleRestoreStreak}
              disabled={points < STREAK_RESTORE_COST}
              style={[styles.streakRestoreButton, points < STREAK_RESTORE_COST && styles.streakRestoreButtonDisabled]}
            >
              <Ionicons name="shield-checkmark" size={18} color="#fff" />
              <Text style={styles.streakRestoreButtonText}>Restore for {STREAK_RESTORE_COST} coins</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Pause Duration Modal */}
      <Modal
        visible={pauseModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPauseModalVisible(false)}
      >
        <Pressable
          style={styles.pauseModalOverlay}
          onPress={() => setPauseModalVisible(false)}
        >
          <View style={styles.pauseModalContent}>
            <View style={styles.pauseModalHeader}>
              <Text style={styles.pauseModalTitle}>Pause Habit</Text>
              <Pressable onPress={() => setPauseModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.pauseModalSubtitle}>
              How many days to pause &quot;{pauseHabitName}&quot;?
            </Text>
            <View style={styles.pausePickerContainer}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                snapToInterval={56}
                decelerationRate="fast"
                contentContainerStyle={styles.pausePickerScrollContent}
              >
                {Array.from({ length: 365 }, (_, i) => i + 1).map((days) => (
                  <Pressable
                    key={days}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedPauseDays(days);
                    }}
                    style={[
                      styles.pausePickerItem,
                      selectedPauseDays === days && styles.pausePickerItemSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pausePickerItemText,
                        selectedPauseDays === days && styles.pausePickerItemTextSelected,
                      ]}
                    >
                      {days} {days === 1 ? 'day' : 'days'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <View style={styles.pauseQuickButtons}>
              {[1, 3, 7, 14, 30].map((days) => (
                <Pressable
                  key={days}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPauseDays(days);
                  }}
                  style={[
                    styles.pauseQuickButton,
                    selectedPauseDays === days && styles.pauseQuickButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pauseQuickButtonText,
                      selectedPauseDays === days && styles.pauseQuickButtonTextActive,
                    ]}
                  >
                    {days === 7 ? '1W' : days === 14 ? '2W' : days === 30 ? '1M' : `${days}D`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.pauseConfirmButton}
              onPress={handleConfirmPause}
            >
              <Ionicons name="pause" size={18} color="#fff" />
              <Text style={styles.pauseConfirmText}>Pause for {selectedPauseDays} {selectedPauseDays === 1 ? 'day' : 'days'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  greenHeaderCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
  },
  greenHeaderGradient: {
    backgroundColor: Colors.primaryDark,
    padding: 20,
  },
  greenHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  greenHeaderLeft: {
    flex: 1,
    minWidth: 100,
  },
  greenHeaderRight: {
    flex: 1,
    alignItems: "flex-start",
    minWidth: 100,
  },
  greenHeaderLabel: {
    fontSize: 13,
    fontFamily: "Nunito_500Medium",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 4,
  },
  greenHeaderBalanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  greenHeaderBalance: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: "#fff",
  },
  greenHeaderScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  greenHeaderScore: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: "#fff",
  },
  greenHeaderBottom: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  greenHeaderStreak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  greenHeaderStreakText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  addButton: {
    height: 44,
    minWidth: 100,
    borderRadius: 22,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 14,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    paddingTop: 4,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  listContent: {
    padding: 20,
    paddingTop: 4,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  habitCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    minHeight: 88,
  },
  habitCardCompleted: {
    opacity: 0.7,
  },
  habitCardPaused: {
    opacity: 0.6,
    backgroundColor: Colors.background,
  },
  habitIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  habitInfo: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  habitName: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    flexShrink: 1,
  },
  habitNameCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textSecondary,
  },
  habitNamePaused: {
    color: Colors.textLight,
  },
  habitMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  habitMetaSecond: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  frequencyBadge: {
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pausedBadge: {
    backgroundColor: Colors.warning + "15",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pausedText: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.warning,
  },
  frequencyText: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 4,
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
  },
  streakContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  habitStreak: {
    fontSize: 12,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
  },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    backgroundColor: Colors.accent + "12",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  habitActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  coinText: {
    fontSize: 16,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.accentDark,
  },
  coinTextPaused: {
    color: Colors.textLight,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  // Pause Modal Styles
  pauseModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pauseModalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  pauseModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pauseModalTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  pauseModalSubtitle: {
    fontSize: 14,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  pausePickerContainer: {
    height: 200,
    marginHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.background,
    overflow: "hidden",
  },
  pausePickerScrollContent: {
    paddingVertical: 72,
  },
  pausePickerItem: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginHorizontal: 8,
  },
  pausePickerItemSelected: {
    backgroundColor: Colors.primary + "15",
  },
  pausePickerItemText: {
    fontSize: 18,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
  },
  pausePickerItemTextSelected: {
    fontSize: 20,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.primary,
  },
  pauseQuickButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pauseQuickButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pauseQuickButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pauseQuickButtonText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  pauseQuickButtonTextActive: {
    color: "#fff",
  },
  pauseConfirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 16,
  },
  pauseConfirmText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  // Profile button styles
  profileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  // Profile menu modal
  profileModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    paddingTop: 100,
    paddingHorizontal: 20,
  },
  profileModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  profileModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  profileModalTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 16,
  },
  profileOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    gap: 12,
    marginBottom: 8,
    backgroundColor: Colors.background,
  },
  profileOptionActive: {
    backgroundColor: Colors.primary + "12",
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  profileOptionAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  profileOptionInfo: {
    flex: 1,
  },
  profileOptionName: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  profileOptionType: {
    fontSize: 13,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  profileMenuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  profileMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  profileMenuItemText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  // Streak restore modal
  streakModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  streakModalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 34,
    paddingTop: 8,
  },
  streakModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  streakModalTitle: {
    fontSize: 24,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  streakModalDescription: {
    fontSize: 15,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  streakModalInfo: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  streakModalInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  streakModalInfoText: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  streakRestoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  streakRestoreButtonDisabled: {
    backgroundColor: Colors.border,
  },
  streakRestoreButtonText: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});
