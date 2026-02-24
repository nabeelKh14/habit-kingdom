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
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import {
  getHabits,
  getTodayCompletions,
  completeHabit,
  deleteHabit,
  getBalance,
  getStreak,
  type Habit,
  type HabitCompletion,
} from "@/lib/storage";

interface HabitWithState extends Habit {
  completedToday: boolean;
  streak: number;
}

function HabitCard({
  habit,
  onComplete,
  onDelete,
}: {
  habit: HabitWithState;
  onComplete: (h: Habit) => void;
  onDelete: (id: string) => void;
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
    if (habit.completedToday) return;
    scale.value = withSequence(
      withSpring(0.95, { damping: 15 }),
      withSpring(1, { damping: 10 })
    );
    checkScale.value = withSpring(1, { damping: 12 });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete(habit);
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

  return (
    <Animated.View style={cardStyle}>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        style={[
          styles.habitCard,
          habit.completedToday && styles.habitCardCompleted,
        ]}
      >
        <View style={[styles.habitIconContainer, { backgroundColor: habit.color + "18" }]}>
          <Feather
            name={habit.icon as any}
            size={22}
            color={habit.color}
          />
        </View>
        <View style={styles.habitInfo}>
          <Text
            style={[
              styles.habitName,
              habit.completedToday && styles.habitNameCompleted,
            ]}
          >
            {habit.name}
          </Text>
          <View style={styles.habitMeta}>
            <Ionicons name="flame" size={13} color={Colors.accent} />
            <Text style={styles.habitStreak}>{habit.streak} day streak</Text>
            <View style={styles.coinBadge}>
              <Ionicons name="diamond" size={11} color={Colors.accent} />
              <Text style={styles.coinText}>+{habit.coinReward}</Text>
            </View>
          </View>
        </View>
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
      </Pressable>
    </Animated.View>
  );
}

export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const [habits, setHabits] = useState<HabitWithState[]>([]);
  const [balance, setBalance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [allHabits, todayCompletions, bal] = await Promise.all([
      getHabits(),
      getTodayCompletions(),
      getBalance(),
    ]);

    const completedIds = new Set(todayCompletions.map((c) => c.habitId));

    const habitsWithState: HabitWithState[] = await Promise.all(
      allHabits.map(async (h) => ({
        ...h,
        completedToday: completedIds.has(h.id),
        streak: await getStreak(h.id),
      }))
    );

    setHabits(habitsWithState);
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

  const handleComplete = async (habit: Habit) => {
    await completeHabit(habit);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    await deleteHabit(id);
    await loadData();
  };

  const completedCount = habits.filter((h) => h.completedToday).length;
  const progress = habits.length > 0 ? completedCount / habits.length : 0;

  const webTopPadding = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Today's Habits</Text>
          <Text style={styles.subtitle}>
            {completedCount}/{habits.length} completed
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.balancePill}>
            <Ionicons name="diamond" size={14} color={Colors.accent} />
            <Text style={styles.balanceText}>{balance}</Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/add-habit");
            }}
            style={styles.addButton}
          >
            <Ionicons name="add" size={24} color={Colors.primary} />
          </Pressable>
        </View>
      </View>

      {habits.length > 0 && (
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

      <FlatList
        data={habits}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <HabitCard
            habit={item}
            onComplete={handleComplete}
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
  },
  greeting: {
    fontSize: 26,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
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
  },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.accent + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  balanceText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 15,
    color: Colors.accentDark,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
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
  },
  habitCardCompleted: {
    opacity: 0.7,
  },
  habitIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  habitInfo: {
    flex: 1,
    marginLeft: 12,
  },
  habitName: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  habitNameCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textSecondary,
  },
  habitMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  habitStreak: {
    fontSize: 12,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
  },
  coinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 8,
    backgroundColor: Colors.accent + "12",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  coinText: {
    fontSize: 11,
    fontFamily: "Nunito_700Bold",
    color: Colors.accentDark,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
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
});
