import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  RefreshControl,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import Colors from "../../constants/colors";
import CuteAvatar from "../../components/CuteAvatar";
import {
  getBalance,
  getUserStats,
  getPurchasedSkillIds,
  savePurchasedSkill,
  updateBalance,
  type UserStats,
} from "../../lib/storage";

interface SkillNode {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  type: 'weapon' | 'armor' | 'ability' | 'accessory';
  requirement?: { type: 'streak' | 'completions' | 'skill'; value: number; id?: string };
  tier: number;
  unlocked: boolean;
  purchased: boolean;
}

const SKILL_TREE: SkillNode[] = [
  // Tier 1 - Starter gear
  { id: 'wooden_sword', name: 'Wooden Sword', description: 'Your first weapon!', icon: '⚔️', cost: 0, type: 'weapon', tier: 1, unlocked: true, purchased: false },
  { id: 'leather_armor', name: 'Leather Armor', description: 'Basic protection', icon: '🛡️', cost: 20, type: 'armor', tier: 1, unlocked: true, purchased: false },
  { id: 'speed_boots', name: 'Speed Boots', description: 'Move faster!', icon: '👟', cost: 15, type: 'accessory', tier: 1, unlocked: true, purchased: false },

  // Tier 2 - Require 3-day streak
  { id: 'iron_sword', name: 'Iron Sword', description: 'A sharper blade', icon: '🗡️', cost: 50, type: 'weapon', requirement: { type: 'streak', value: 3 }, tier: 2, unlocked: false, purchased: false },
  { id: 'iron_shield', name: 'Iron Shield', description: 'Blocks attacks', icon: '🔰', cost: 50, type: 'armor', requirement: { type: 'streak', value: 3 }, tier: 2, unlocked: false, purchased: false },
  { id: 'magic_ring', name: 'Magic Ring', description: 'Glows with power', icon: '💍', cost: 40, type: 'accessory', requirement: { type: 'streak', value: 3 }, tier: 2, unlocked: false, purchased: false },

  // Tier 3 - Require 7-day streak
  { id: 'flame_sword', name: 'Flame Sword', description: 'Burns with fire!', icon: '🔥', cost: 100, type: 'weapon', requirement: { type: 'streak', value: 7 }, tier: 3, unlocked: false, purchased: false },
  { id: 'dragon_armor', name: 'Dragon Armor', description: 'Made of dragon scales', icon: '🐉', cost: 120, type: 'armor', requirement: { type: 'streak', value: 7 }, tier: 3, unlocked: false, purchased: false },
  { id: 'winged_boots', name: 'Winged Boots', description: 'Fly through the air!', icon: '🪽', cost: 80, type: 'accessory', requirement: { type: 'streak', value: 7 }, tier: 3, unlocked: false, purchased: false },

  // Tier 4 - Require 14-day streak
  { id: 'thunder_hammer', name: 'Thunder Hammer', description: 'Strikes with lightning', icon: '⚡', cost: 200, type: 'weapon', requirement: { type: 'streak', value: 14 }, tier: 4, unlocked: false, purchased: false },
  { id: 'crystal_shield', name: 'Crystal Shield', description: 'Nearly unbreakable', icon: '💎', cost: 200, type: 'armor', requirement: { type: 'streak', value: 14 }, tier: 4, unlocked: false, purchased: false },

  // Tier 5 - Require 30-day streak
  { id: 'legendary_blade', name: 'Legendary Blade', description: 'The ultimate weapon', icon: '🌟', cost: 500, type: 'weapon', requirement: { type: 'streak', value: 30 }, tier: 5, unlocked: false, purchased: false },
  { id: 'crown_of_heroes', name: 'Crown of Heroes', description: 'Worn by champions', icon: '👑', cost: 500, type: 'accessory', requirement: { type: 'streak', value: 30 }, tier: 5, unlocked: false, purchased: false },
];

export default function KingdomScreen() {
  const insets = useSafeAreaInsets();
  const [points, setPoints] = useState(0);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [skills, setSkills] = useState<SkillNode[]>(SKILL_TREE);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<SkillNode | null>(null);
  const [celebrateSkill, setCelebrateSkill] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [pts, userStats, purchasedIds] = await Promise.all([
        getBalance(),
        getUserStats(),
        getPurchasedSkillIds(),
      ]);
      setPoints(pts);
      setStats(userStats);

      // Update skill tree unlock status based on stats, and restore purchased state from DB
      setSkills(SKILL_TREE.map(skill => {
        let unlocked = skill.tier === 1;
        if (skill.requirement) {
          if (skill.requirement.type === 'streak') {
            unlocked = userStats.longestStreak >= skill.requirement.value;
          } else if (skill.requirement.type === 'completions') {
            unlocked = userStats.totalCompletions >= skill.requirement.value;
          }
        }
        const purchased = purchasedIds.includes(skill.id);
        return { ...skill, unlocked, purchased };
      }));
    } catch (error) {
      console.error('Error loading kingdom data:', error);
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
    await loadData();
    setRefreshing(false);
  };

  const handlePurchaseSkill = (skill: SkillNode) => {
    if (skill.purchased) return;
    if (!skill.unlocked) {
      Alert.alert('Locked', skill.requirement
        ? `You need a ${skill.requirement.value}-day streak to unlock this!`
        : 'This item is locked.');
      return;
    }
    if (points < skill.cost) {
      Alert.alert('Not Enough Coins', `You need ${skill.cost} coins. You have ${points} coins.`);
      return;
    }
    Alert.alert(
      `Buy ${skill.name}?`,
      `Spend ${skill.cost} coins on ${skill.icon} ${skill.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
           onPress: async () => {
             try {
               await savePurchasedSkill(skill.id);
               await updateBalance(-skill.cost);
               setPoints(p => p - skill.cost);
               setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, purchased: true } : s));
               setCelebrateSkill(skill.id);
               setTimeout(() => setCelebrateSkill(null), 2000);
             } catch (error) {
               console.error('Error purchasing skill:', error);
               Alert.alert('Error', 'Failed to purchase skill. Please try again.');
             }
           },
        },
      ]
    );
  };

  const avatarLevel = Math.min(Math.floor((stats?.longestStreak || 0) / 5) + 1, 10);
  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  const tiers = [1, 2, 3, 4, 5];
  const tierLabels = ['', 'Starter Gear', '3-Day Streak', '7-Day Streak', '14-Day Streak', '30-Day Legend'];

  const purchasedCount = skills.filter(s => s.purchased).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === "web" ? { paddingBottom: 34 + 60 } : { paddingBottom: 80 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Kingdom</Text>

        {/* Avatar Section */}
      <View style={styles.avatarSection}>
            <CuteAvatar
              level={avatarLevel}
              size={140}
              equippedSkills={skills.filter(s => s.purchased).map(s => ({ id: s.id, type: s.type, icon: s.icon }))}
              celebrateSkill={celebrateSkill}
            />
        <Text style={styles.avatarTitle}>
          Level {avatarLevel} Adventurer
        </Text>
        <View style={styles.avatarStats}>
          <View style={styles.avatarStatItem}>
            <Ionicons name="flame" size={16} color={Colors.accent} />
            <Text style={styles.avatarStatText}>{stats?.longestStreak || 0} day streak</Text>
          </View>
          <View style={styles.avatarStatDivider} />
          <View style={styles.avatarStatItem}>
            <Ionicons name="diamond" size={16} color={Colors.accent} />
            <Text style={styles.avatarStatText}>{points} coins</Text>
          </View>
          <View style={styles.avatarStatDivider} />
          <View style={styles.avatarStatItem}>
            <Ionicons name="trophy" size={16} color={Colors.accent} />
            <Text style={styles.avatarStatText}>{purchasedCount}/{skills.length} gear</Text>
          </View>
        </View>
      </View>

      {/* Skill Tree */}
      <Text style={styles.sectionTitle}>Skill Tree</Text>
      <Text style={styles.sectionSubtitle}>Unlock gear by building streaks and spending coins</Text>

      {tiers.map(tier => {
        const tierSkills = skills.filter(s => s.tier === tier);
        if (tierSkills.length === 0) return null;
        return (
          <View key={tier} style={styles.tierSection}>
            <View style={styles.tierHeader}>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>Tier {tier}</Text>
              </View>
              <Text style={styles.tierLabel}>{tierLabels[tier]}</Text>
            </View>
            <View style={styles.skillRow}>
              {tierSkills.map((skill, idx) => (
                <Animated.View
                  key={skill.id}
                  entering={FadeInDown.delay(idx * 80).duration(300)}
                  style={styles.skillCardWrapper}
                >
                  <Pressable
                    onPress={() => {
                      if (!skill.purchased) {
                        setSelectedSkill(skill);
                      }
                    }}
                    onLongPress={() => handlePurchaseSkill(skill)}
                    style={[
                      styles.skillCard,
                      skill.purchased && styles.skillCardPurchased,
                      !skill.unlocked && !skill.purchased && styles.skillCardLocked,
                    ]}
                  >
                    <Text style={styles.skillIcon}>{skill.icon}</Text>
                    <Text style={[
                      styles.skillName,
                      !skill.unlocked && !skill.purchased && styles.skillNameLocked,
                    ]} numberOfLines={1}>
                      {skill.name}
                    </Text>
                    {skill.purchased ? (
                      <View style={styles.purchasedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        <Text style={styles.purchasedText}>Owned</Text>
                      </View>
                    ) : !skill.unlocked ? (
                      <View style={styles.lockedBadge}>
                        <Ionicons name="lock-closed" size={12} color={Colors.textLight} />
                        <Text style={styles.lockedText}>
                          {skill.requirement?.value}-day streak
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.costBadge}>
                        <Ionicons name="diamond" size={11} color={Colors.accent} />
                        <Text style={styles.costText}>{skill.cost}</Text>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </View>
        );
      })}

      </ScrollView>

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.detailOverlay}>
          <Pressable style={styles.detailDismiss} onPress={() => setSelectedSkill(null)} />
          <View style={styles.detailCard}>
            <Text style={styles.detailIcon}>{selectedSkill.icon}</Text>
            <Text style={styles.detailName}>{selectedSkill.name}</Text>
            <Text style={styles.detailDesc}>{selectedSkill.description}</Text>
            <View style={styles.detailMeta}>
              <View style={styles.detailMetaItem}>
                <Text style={styles.detailMetaLabel}>Type</Text>
                <Text style={styles.detailMetaValue}>{selectedSkill.type}</Text>
              </View>
              <View style={styles.detailMetaItem}>
                <Text style={styles.detailMetaLabel}>Cost</Text>
                <Text style={styles.detailMetaValue}>{selectedSkill.cost} coins</Text>
              </View>
            </View>
            {selectedSkill.unlocked && !selectedSkill.purchased && (
              <Pressable
                onPress={() => {
                  handlePurchaseSkill(selectedSkill);
                  setSelectedSkill(null);
                }}
                style={styles.buyButton}
              >
                <Ionicons name="diamond" size={18} color="#fff" />
                <Text style={styles.buyButtonText}>Buy for {selectedSkill.cost} coins</Text>
              </Pressable>
            )}
            {selectedSkill.purchased && (
              <View style={styles.ownedButton}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                <Text style={styles.ownedButtonText}>Already Owned</Text>
              </View>
            )}
            {!selectedSkill.unlocked && (
              <View style={styles.unlockHint}>
                <Ionicons name="lock-closed" size={18} color={Colors.textLight} />
                <Text style={styles.unlockHintText}>
                  {selectedSkill.requirement
                    ? `Reach a ${selectedSkill.requirement.value}-day streak to unlock`
                    : 'Locked'}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  screenTitle: {
    fontSize: 26,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    paddingTop: 12,
    paddingBottom: 8,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: Colors.primaryDark,
    borderRadius: 24,
    marginBottom: 20,
    marginTop: 8,
  },
  avatarTitle: {
    fontSize: 18,
    fontFamily: "Nunito_800ExtraBold",
    color: "#fff",
    marginTop: 12,
  },
  avatarStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  avatarStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  avatarStatText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  avatarStatDivider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  tierSection: {
    marginBottom: 16,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  tierBadge: {
    backgroundColor: Colors.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierBadgeText: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
  tierLabel: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  skillRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  skillCardWrapper: {
    flex: 1,
    minWidth: 100,
    maxWidth: 160,
  },
  skillCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  skillCardPurchased: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + "08",
  },
  skillCardLocked: {
    opacity: 0.5,
  },
  skillIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  skillName: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  skillNameLocked: {
    color: Colors.textLight,
  },
  purchasedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.success + "15",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  purchasedText: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.success,
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lockedText: {
    fontSize: 10,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textLight,
  },
  costBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.accent + "15",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  costText: {
    fontSize: 12,
    fontFamily: "Nunito_700Bold",
    color: Colors.accentDark,
  },
  // Detail overlay
  detailOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  detailDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    width: "85%",
    maxWidth: 320,
    alignItems: "center",
  },
  detailIcon: {
    fontSize: 56,
    marginBottom: 12,
  },
  detailName: {
    fontSize: 22,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    marginBottom: 6,
  },
  detailDesc: {
    fontSize: 14,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 16,
  },
  detailMeta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
  },
  detailMetaItem: {
    alignItems: "center",
  },
  detailMetaLabel: {
    fontSize: 12,
    fontFamily: "Nunito_500Medium",
    color: Colors.textLight,
  },
  detailMetaValue: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginTop: 2,
  },
  buyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    justifyContent: "center",
  },
  buyButtonText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  ownedButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.success + "15",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    justifyContent: "center",
  },
  ownedButtonText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.success,
  },
  unlockHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    justifyContent: "center",
  },
  unlockHintText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textLight,
  },
});
