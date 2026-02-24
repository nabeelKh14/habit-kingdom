import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import {
  getBalance,
  getCompletions,
  getRedemptions,
  type HabitCompletion,
  type RewardRedemption,
} from "@/lib/storage";

type Transaction = {
  id: string;
  type: "earned" | "spent";
  name: string;
  amount: number;
  date: string;
};

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const balanceScale = useSharedValue(1);

  const loadData = useCallback(async () => {
    const [bal, completions, redemptions] = await Promise.all([
      getBalance(),
      getCompletions(),
      getRedemptions(),
    ]);

    setBalance(bal);

    const earned: Transaction[] = completions.map((c) => ({
      id: c.id,
      type: "earned",
      name: c.habitName,
      amount: c.coinReward,
      date: c.completedAt,
    }));

    const spent: Transaction[] = redemptions.map((r) => ({
      id: r.id,
      type: "spent",
      name: r.rewardName,
      amount: r.cost,
      date: r.redeemedAt,
    }));

    const all = [...earned, ...spent].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    setTransactions(all);
    setLoading(false);

    balanceScale.value = withSpring(1.05, { damping: 8 });
    setTimeout(() => {
      balanceScale.value = withSpring(1, { damping: 10 });
    }, 200);
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

  const balanceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: balanceScale.value }],
  }));

  const totalEarned = transactions
    .filter((t) => t.type === "earned")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSpent = transactions
    .filter((t) => t.type === "spent")
    .reduce((sum, t) => sum + t.amount, 0);

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
      <Text style={styles.screenTitle}>Wallet</Text>

      <View style={styles.balanceCard}>
        <View style={styles.balanceCardGradient}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Animated.View style={[styles.balanceRow, balanceStyle]}>
            <Ionicons name="diamond" size={32} color="#FBBF24" />
            <Text style={styles.balanceAmount}>{balance}</Text>
          </Animated.View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="arrow-up-circle" size={16} color="#6EE7B7" />
              <Text style={styles.statText}>{totalEarned} earned</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="arrow-down-circle" size={16} color="#FCA5A5" />
              <Text style={styles.statText}>{totalSpent} spent</Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeIn.delay(index * 40).duration(300)}>
            <View style={styles.transactionItem}>
              <View
                style={[
                  styles.transactionIcon,
                  {
                    backgroundColor:
                      item.type === "earned"
                        ? Colors.success + "15"
                        : Colors.error + "15",
                  },
                ]}
              >
                <Ionicons
                  name={item.type === "earned" ? "arrow-up" : "arrow-down"}
                  size={18}
                  color={item.type === "earned" ? Colors.success : Colors.error}
                />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionName}>{item.name}</Text>
                <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  {
                    color:
                      item.type === "earned" ? Colors.success : Colors.error,
                  },
                ]}
              >
                {item.type === "earned" ? "+" : "-"}{item.amount}
              </Text>
            </View>
          </Animated.View>
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
        scrollEnabled={!!transactions.length}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyText}>
                Complete habits to start earning coins
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
  screenTitle: {
    fontSize: 26,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  balanceCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 20,
  },
  balanceCardGradient: {
    backgroundColor: Colors.primaryDark,
    padding: 24,
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: "Nunito_500Medium",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 8,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  balanceAmount: {
    fontSize: 44,
    fontFamily: "Nunito_800ExtraBold",
    color: "#fff",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  statDivider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 6,
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  transactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  transactionName: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  transactionDate: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontFamily: "Nunito_800ExtraBold",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
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
});
