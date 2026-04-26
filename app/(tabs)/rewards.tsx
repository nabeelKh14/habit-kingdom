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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import Colors from "../../constants/colors";
import { getReminderSettings } from "../../lib/settings-storage";
import {
  getRewards,
  getBalance,
  redeemReward,
  deleteReward,
  updateReward,
  type Reward,
  getTrophiesWithStatus,
  getUserStats,
  type Trophy,
  type UserStats,
  addBonusPoints,
  applyPenaltyPoints,
  resetStreak,
  isParentProfile,
  getProfiles,
  setActiveProfileId,
  type Profile,
} from "../../lib/storage";
import { getActiveProfileId, setActiveProfileId as saveActiveProfileId } from "../../lib/onboarding-storage";

function RewardCard({
  reward,
  points,
  onRedeem,
  onDelete,
  onEdit,
}: {
  reward: Reward;
  points: number;
  onRedeem: (r: Reward) => void;
  onDelete: (id: string) => void;
  onEdit: (r: Reward) => void;
}) {
  const scale = useSharedValue(1);
  const canAfford = points >= reward.cost;

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleRedeem = () => {
    if (!canAfford) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Not Enough Points", `You need ${reward.cost - points} more points for this reward.`);
      return;
    }

    Alert.alert(
      "🎉 Redeem Reward",
      `Spend ${reward.cost} points on "${reward.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Redeem 🎁",
          onPress: () => {
            scale.value = withSequence(
              withSpring(0.92, { damping: 15 }),
              withSpring(1, { damping: 10 })
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onRedeem(reward);
          },
        },
      ]
    );
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Reward", `Remove "${reward.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(reward.id),
      },
    ]);
  };

  const handleEditPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEdit(reward);
  };

  return (
    <Animated.View style={[cardStyle, styles.rewardCardWrapper]}>
      <Pressable
        onPress={handleRedeem}
        onLongPress={handleLongPress}
        style={[styles.rewardCard, !canAfford && styles.rewardCardDisabled]}
      >
        <View style={[styles.rewardIconContainer, { backgroundColor: reward.color + "18" }]}>
          <Feather name={reward.icon as any} size={28} color={reward.color} />
        </View>
        <Text style={styles.rewardName} numberOfLines={2}>
          {reward.name}
        </Text>
        <View style={[styles.rewardCostBadge, !canAfford && styles.rewardCostDisabled]}>
          <Ionicons name="diamond" size={12} color={canAfford ? Colors.accent : Colors.textLight} />
          <Text style={[styles.rewardCostText, !canAfford && { color: Colors.textLight }]}>
            {reward.cost}
          </Text>
        </View>
        <Pressable
          onPress={handleEditPress}
          style={styles.editButton}
        >
          <Feather name="edit-2" size={14} color={Colors.textSecondary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

interface TrophyWithStatus {
  trophy: Trophy;
  unlocked: boolean;
  unlockedAt?: string;
  progress: number;
}

function TrophyCard({
  trophy,
  stats,
}: {
  trophy: TrophyWithStatus;
  stats: UserStats;
}) {
  const scale = useSharedValue(1);
  const progressPercent = trophy.progress / trophy.trophy.requirement;

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (trophy.unlocked) {
      scale.value = withSequence(
        withSpring(0.95, { damping: 15 }),
        withSpring(1, { damping: 10 })
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const unlockDate = trophy.unlockedAt 
        ? new Date(trophy.unlockedAt).toLocaleDateString()
        : 'Unknown';
        
      Alert.alert(
        `${trophy.trophy.emoji} ${trophy.trophy.title}`,
        `${trophy.trophy.description}\n\nUnlocked on: ${unlockDate}`
      );
    }
  };

  return (
    <Animated.View style={[cardStyle, styles.trophyCardWrapper]}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.trophyCard,
          !trophy.unlocked && styles.trophyCardLocked,
        ]}
      >
        <View style={[
          styles.trophyIconContainer,
          { backgroundColor: trophy.unlocked ? Colors.accent + "18" : Colors.border + "50" }
        ]}>
          <Text style={[
            styles.trophyEmoji,
            !trophy.unlocked && styles.trophyEmojiLocked,
          ]}>
            {trophy.trophy.emoji}
          </Text>
        </View>
        <Text style={[
          styles.trophyTitle,
          !trophy.unlocked && styles.trophyTitleLocked,
        ]} numberOfLines={1}>
          {trophy.trophy.title}
        </Text>
        <Text style={[
          styles.trophyDescription,
          !trophy.unlocked && styles.trophyDescriptionLocked,
        ]} numberOfLines={2}>
          {trophy.trophy.description}
        </Text>
        
        {/* Progress bar */}
        {!trophy.unlocked && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPercent * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {trophy.progress}/{trophy.trophy.requirement}
            </Text>
          </View>
        )}
        
        {trophy.unlocked && (
          <View style={styles.unlockedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            <Text style={styles.unlockedText}>Unlocked</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

type TabType = 'rewards' | 'trophies';

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const [points, setPoints] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [trophies, setTrophies] = useState<TrophyWithStatus[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [activeTab, setActiveTab] = useState<'rewards' | 'trophies'>('rewards');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [settings, setSettings] = useState({ bonusAmount: 10, penaltyAmount: 10 });
  const [isParent, setIsParent] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const celebrationScale = useSharedValue(0);

  const handleSwitchProfile = async (profile: Profile) => {
    try {
      setActiveProfileId(profile.id);
      await saveActiveProfileId(profile.id);
      setActiveProfile(profile);
      setProfileMenuVisible(false);
      // Reload data for new profile
      loadData();
    } catch (error) {
      console.error('Error switching profile:', error);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [allRewards, pts, allTrophies, userStats, reminderSettings, profiles, activeId] = await Promise.all([
        getRewards(),
        getBalance(),
        getTrophiesWithStatus(),
        getUserStats(),
        getReminderSettings(),
        getProfiles(),
        getActiveProfileId(),
      ]);
      setRewards(allRewards);
      setPoints(pts);
      setTrophies(allTrophies);
      setStats(userStats);
      setSettings({
        bonusAmount: reminderSettings.bonusAmount,
        penaltyAmount: reminderSettings.penaltyAmount,
      });
      setProfiles(profiles);
      setActiveProfile(profiles.find(p => p.id === activeId) || null);
      setIsParent(isParentProfile());
    } catch (error) {
      console.error('Error loading rewards data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
      console.error('Error refreshing rewards:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRedeem = async (reward: Reward) => {
    try {
      // Trigger celebration animation
      setShowCelebration(true);
      celebrationScale.value = withSequence(
        withSpring(1.2, { damping: 8 }),
        withTiming(0, { duration: 0 })
      );
      
      await redeemReward(reward);
      await loadData();
      
      // Hide celebration after animation
      setTimeout(() => {
        setShowCelebration(false);
      }, 1500);
    } catch (error) {
      console.error('Error redeeming reward:', error);
      Alert.alert('Error', 'Failed to redeem reward. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReward(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting reward:', error);
      Alert.alert('Error', 'Failed to delete reward. Please try again.');
    }
  };

  const handleEdit = (reward: Reward) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/add-reward?id=${reward.id}`);
  };

  const handleBonus = () => {
    Alert.prompt(
      "Give Bonus Points",
      `Enter amount of points to add to ${activeProfile?.name}'s account:`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add",
          onPress: async (val?: string) => {
            const num = parseInt(val || "0", 10);
            if (isNaN(num) || num <= 0) {
              Alert.alert("Invalid Amount", "Please enter a positive number.");
              return;
            }
            if (num > 10000) {
              Alert.alert("Amount Too High", "Maximum bonus is 10,000 points.");
              return;
            }
            try {
              await addBonusPoints(num, activeProfile?.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadData();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to add bonus points.");
            }
          }
        }
      ],
      "plain-text",
      settings.bonusAmount.toString(),
      "numeric"
    );
  };

  const handlePenalty = () => {
    Alert.prompt(
      "Deduct Points",
      `Enter amount of points to deduct from ${activeProfile?.name}'s account:`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deduct",
          style: "destructive",
          onPress: async (val?: string) => {
            const num = parseInt(val || "0", 10);
            if (isNaN(num) || num <= 0) {
              Alert.alert("Invalid Amount", "Please enter a positive number.");
              return;
            }
            if (num > 10000) {
              Alert.alert("Amount Too High", "Maximum penalty is 10,000 points.");
              return;
            }
            try {
              await applyPenaltyPoints(num, activeProfile?.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              loadData();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to apply penalty.");
            }
          }
        }
      ],
      "plain-text",
      settings.penaltyAmount.toString(),
      "numeric"
    );
  };

  const handleResetStreak = () => {
    Alert.alert(
      "Reset Streak",
      `Are you sure you want to reset ${activeProfile?.name}'s streak? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await resetStreak(activeProfile?.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              loadData();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to reset streak.");
            }
          }
        }
      ]
    );
  };

  const unlockedCount = trophies.filter(t => t.unlocked).length;
  const totalCount = trophies.length;

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  const celebrationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
    opacity: celebrationScale.value > 0 ? 1 : 0,
  }));

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
      {showCelebration && (
        <Animated.View style={[styles.celebrationOverlay, celebrationStyle]} entering={FadeIn} exiting={FadeOut}>
          <View style={styles.celebrationContent}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <Text style={styles.celebrationText}>Reward Redeemed!</Text>
            <Text style={styles.celebrationSubtext}>🎁 Enjoy your reward!</Text>
          </View>
        </Animated.View>
      )}

      {/* Profile Selector - Full width above header */}
      <View style={styles.profileSelectorContainer}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setProfileMenuVisible(true);
          }}
          style={styles.profileButtonFullWidth}
        >
          <View style={styles.profileAvatar}>
            <Ionicons name={activeProfile?.type === 'parent' ? 'person' : 'happy'} size={18} color="#fff" />
          </View>
          <Text style={styles.profileName}>{activeProfile?.name || 'Profile'}</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.screenTitle}>Rewards</Text>
            <View style={styles.balanceInline}>
              <Ionicons name="diamond" size={14} color={Colors.accent} />
              <Text style={styles.balanceInlineText}>{points} points available</Text>
            </View>
          </View>
        </View>
        {activeTab === 'rewards' && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-reward");
          }}
          style={styles.addButton}
        >
          <Ionicons name="add" size={22} color={Colors.primary} />
          <Text style={styles.addButtonText}>Add Reward</Text>
        </Pressable>
        )}
      </View>

      <View style={styles.adminActions}>
          <Pressable onPress={handleBonus} style={[styles.adminButton, { backgroundColor: Colors.success + "15" }]}>
            <Ionicons name="add-circle" size={18} color={Colors.success} />
            <Text style={[styles.adminButtonText, { color: Colors.success }]}>Bonus</Text>
          </Pressable>
          <Pressable onPress={handlePenalty} style={[styles.adminButton, { backgroundColor: Colors.error + "15" }]}>
            <Ionicons name="remove-circle" size={18} color={Colors.error} />
            <Text style={[styles.adminButtonText, { color: Colors.error }]}>Penalty</Text>
          </Pressable>
          <Pressable onPress={handleResetStreak} style={[styles.adminButton, { backgroundColor: Colors.warning + "15" }]}>
            <Ionicons name="refresh-circle" size={18} color={Colors.warning} />
            <Text style={[styles.adminButtonText, { color: Colors.warning }]}>Reset Streak</Text>
          </Pressable>
        </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('rewards');
          }}
          style={[
            styles.tab,
            activeTab === 'rewards' && styles.tabActive,
          ]}
        >
          <Feather 
            name="gift" 
            size={18} 
            color={activeTab === 'rewards' ? Colors.primary : Colors.textSecondary} 
          />
          <Text style={[
            styles.tabText,
            activeTab === 'rewards' && styles.tabTextActive,
          ]}>
            Rewards
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('trophies');
          }}
          style={[
            styles.tab,
            activeTab === 'trophies' && styles.tabActive,
          ]}
        >
          <Text style={styles.trophyTabEmoji}>🏆</Text>
          <Text style={[
            styles.tabText,
            activeTab === 'trophies' && styles.tabTextActive,
          ]}>
            Trophies
          </Text>
          <View style={styles.trophyCountBadge}>
            <Text style={styles.trophyCountText}>{unlockedCount}/{totalCount}</Text>
          </View>
        </Pressable>
      </View>

      {activeTab === 'rewards' ? (
        <FlatList
          data={rewards}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <RewardCard
              reward={item}
              points={points}
              onRedeem={handleRedeem}
              onDelete={handleDelete}
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
          scrollEnabled={!!rewards.length}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyState}>
                <Ionicons name="gift-outline" size={56} color={Colors.textLight} />
                <Text style={styles.emptyTitle}>No rewards yet</Text>
                <Text style={styles.emptyText}>
                  Add rewards your kids can earn with their points
                </Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList
            data={trophies}
            keyExtractor={(item) => item.trophy.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            renderItem={({ item }) => (
              <TrophyCard
                trophy={item}
                stats={stats || {
                  totalCompletions: 0,
                  longestStreak: 0,
                  longestSingleHabitStreak: 0,
                  longestSingleHabitId: '',
                }}
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
            scrollEnabled={!!trophies.length}
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.emptyState}>
                  <Text style={styles.trophyEmojiLarge}>🏆</Text>
                  <Text style={styles.emptyTitle}>No trophies yet</Text>
                  <Text style={styles.emptyText}>
                    Complete habits to unlock trophies!
                  </Text>
                </View>
              )
            }
          />
      )}

      {/* Profile Menu Modal */}
      <Modal
        visible={profileMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <Pressable
          style={styles.profileModalOverlay}
          onPress={() => setProfileMenuVisible(false)}
        >
          <View style={styles.profileModalContent}>
            <View style={styles.profileModalHandle} />
            <Text style={styles.profileModalTitle}>Switch Profile</Text>
            
            <ScrollView style={{ maxHeight: '80%' }}>
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
            </ScrollView>

            <View style={styles.profileMenuDivider} />

            <Pressable
              onPress={() => {
                setProfileMenuVisible(false);
                router.push("/settings");
              }}
              style={styles.profileMenuItem}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.profileMenuItemText}>Manage Profiles</Text>
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
    paddingBottom: 12,
    gap: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  profileAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  screenTitle: {
    fontSize: 26,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
  },
  balanceInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  balanceInlineText: {
    fontSize: 14,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
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
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 12,
  },
  adminActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  adminButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
  },
  adminButtonText: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  tabActive: {
    backgroundColor: Colors.primary + "15",
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  trophyTabEmoji: {
    fontSize: 16,
  },
  trophyCountBadge: {
    backgroundColor: Colors.accent + "20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  trophyCountText: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    color: Colors.accentDark,
  },
  statsContainer: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  listContent: {
    padding: 20,
    paddingTop: 4,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  rewardCardWrapper: {
    flex: 1,
  },
  rewardCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    minHeight: 180,
  },
  rewardCardDisabled: {
    opacity: 0.55,
  },
  rewardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  rewardName: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  rewardCostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accent + "15",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rewardCostDisabled: {
    backgroundColor: Colors.border,
  },
  rewardCostText: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.accentDark,
  },
  editButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyCardWrapper: {
    flex: 1,
  },
  trophyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  trophyCardLocked: {
    opacity: 0.8,
  },
  trophyIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  trophyEmoji: {
    fontSize: 32,
  },
  trophyEmojiLarge: {
    fontSize: 48,
  },
  trophyEmojiLocked: {
    opacity: 0.4,
  },
  trophyTitle: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 4,
  },
  trophyTitleLocked: {
    color: Colors.textSecondary,
  },
  trophyDescription: {
    fontSize: 11,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  trophyDescriptionLocked: {
    color: Colors.textLight,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  progressBar: {
    height: 6,
    width: '100%',
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  unlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + "15",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  unlockedText: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.success,
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
    paddingHorizontal: 40,
  },
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  celebrationContent: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    minWidth: 250,
  },
  celebrationEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  celebrationText: {
    fontSize: 24,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    marginBottom: 8,
  },
  celebrationSubtext: {
    fontSize: 16,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
  },
  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  profileModalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
  },
  profileModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  profileModalTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 16,
  },
  profileOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
    marginBottom: 8,
  },
  profileOptionActive: {
    backgroundColor: Colors.primary + '15',
  },
  profileOptionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileOptionInfo: {
    flex: 1,
  },
  profileOptionName: {
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  profileOptionType: {
    fontSize: 13,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
  },
  profileMenuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  profileMenuItemText: {
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  profileSelectorContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  profileButtonFullWidth: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
