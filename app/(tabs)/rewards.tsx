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
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import {
  getRewards,
  getBalance,
  redeemReward,
  deleteReward,
  type Reward,
} from "@/lib/storage";

function RewardCard({
  reward,
  balance,
  onRedeem,
  onDelete,
}: {
  reward: Reward;
  balance: number;
  onRedeem: (r: Reward) => void;
  onDelete: (id: string) => void;
}) {
  const scale = useSharedValue(1);
  const canAfford = balance >= reward.cost;

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleRedeem = () => {
    if (!canAfford) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Not Enough Coins", `You need ${reward.cost - balance} more coins for this reward.`);
      return;
    }

    Alert.alert("Redeem Reward", `Spend ${reward.cost} coins on "${reward.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Redeem",
        onPress: () => {
          scale.value = withSequence(
            withSpring(0.92, { damping: 15 }),
            withSpring(1, { damping: 10 })
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onRedeem(reward);
        },
      },
    ]);
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
      </Pressable>
    </Animated.View>
  );
}

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [balance, setBalance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [allRewards, bal] = await Promise.all([getRewards(), getBalance()]);
    setRewards(allRewards);
    setBalance(bal);
    setLoading(false);
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

  const handleRedeem = async (reward: Reward) => {
    await redeemReward(reward);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    await deleteReward(id);
    await loadData();
  };

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Rewards</Text>
          <View style={styles.balanceInline}>
            <Ionicons name="diamond" size={14} color={Colors.accent} />
            <Text style={styles.balanceInlineText}>{balance} coins available</Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-reward");
          }}
          style={styles.addButton}
        >
          <Ionicons name="add" size={24} color={Colors.primary} />
        </Pressable>
      </View>

      <FlatList
        data={rewards}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <RewardCard
            reward={item}
            balance={balance}
            onRedeem={handleRedeem}
            onDelete={handleDelete}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === "web" ? { paddingBottom: 34 + 60 } : {},
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
                Add rewards your kids can earn with their coins
              </Text>
            </View>
          )
        }
      />
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
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
});
