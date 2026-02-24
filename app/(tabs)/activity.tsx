import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import {
  getCompletions,
  getRedemptions,
  type HabitCompletion,
  type RewardRedemption,
} from "@/lib/storage";

type ActivityItem = {
  id: string;
  type: "completion" | "redemption";
  name: string;
  amount: number;
  date: string;
};

type Section = {
  title: string;
  data: ActivityItem[];
};

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const [sections, setSections] = useState<Section[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [completions, redemptions] = await Promise.all([
      getCompletions(),
      getRedemptions(),
    ]);

    const items: ActivityItem[] = [
      ...completions.map((c) => ({
        id: c.id,
        type: "completion" as const,
        name: c.habitName,
        amount: c.coinReward,
        date: c.completedAt,
      })),
      ...redemptions.map((r) => ({
        id: r.id,
        type: "redemption" as const,
        name: r.rewardName,
        amount: r.cost,
        date: r.redeemedAt,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const grouped: Record<string, ActivityItem[]> = {};
    items.forEach((item) => {
      const date = new Date(item.date);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      let key: string;
      if (date.toDateString() === today.toDateString()) {
        key = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = "Yesterday";
      } else {
        key = date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    const sectionsList: Section[] = Object.entries(grouped).map(
      ([title, data]) => ({ title, data })
    );

    setSections(sectionsList);
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

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  const allItems = sections.reduce(
    (sum, s) => sum + s.data.length,
    0
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
      <Text style={styles.screenTitle}>Activity Log</Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        )}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeIn.delay(index * 30).duration(250)}>
            <View style={styles.activityItem}>
              <View
                style={[
                  styles.activityIcon,
                  {
                    backgroundColor:
                      item.type === "completion"
                        ? Colors.success + "15"
                        : Colors.accent + "15",
                  },
                ]}
              >
                <Ionicons
                  name={
                    item.type === "completion"
                      ? "checkmark-circle"
                      : "gift"
                  }
                  size={20}
                  color={
                    item.type === "completion"
                      ? Colors.success
                      : Colors.accent
                  }
                />
              </View>
              <View style={styles.activityInfo}>
                <Text style={styles.activityName}>{item.name}</Text>
                <Text style={styles.activityTime}>{formatTime(item.date)}</Text>
              </View>
              <View style={styles.activityAmountContainer}>
                <Text
                  style={[
                    styles.activityAmount,
                    {
                      color:
                        item.type === "completion"
                          ? Colors.success
                          : Colors.error,
                    },
                  ]}
                >
                  {item.type === "completion" ? "+" : "-"}{item.amount}
                </Text>
                <Ionicons
                  name="diamond"
                  size={11}
                  color={
                    item.type === "completion"
                      ? Colors.success
                      : Colors.error
                  }
                />
              </View>
            </View>
          </Animated.View>
        )}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === "web" ? { paddingBottom: 34 + 60 } : {},
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptyText}>
                Your habit completions and reward redemptions will show up here
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
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activityInfo: {
    flex: 1,
    marginLeft: 12,
  },
  activityName: {
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  activityTime: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activityAmountContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  activityAmount: {
    fontSize: 15,
    fontFamily: "Nunito_800ExtraBold",
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
