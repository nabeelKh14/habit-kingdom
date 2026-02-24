import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

export interface Habit {
  id: string;
  name: string;
  icon: string;
  coinReward: number;
  color: string;
  createdAt: string;
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  habitName: string;
  coinReward: number;
  completedAt: string;
}

export interface Reward {
  id: string;
  name: string;
  icon: string;
  cost: number;
  color: string;
  createdAt: string;
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
}

const KEYS = {
  HABITS: "kidcoins_habits",
  COMPLETIONS: "kidcoins_completions",
  REWARDS: "kidcoins_rewards",
  REDEMPTIONS: "kidcoins_redemptions",
  BALANCE: "kidcoins_balance",
};

export async function getHabits(): Promise<Habit[]> {
  const data = await AsyncStorage.getItem(KEYS.HABITS);
  return data ? JSON.parse(data) : [];
}

export async function saveHabit(habit: Omit<Habit, "id" | "createdAt">): Promise<Habit> {
  const habits = await getHabits();
  const newHabit: Habit = {
    ...habit,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  habits.push(newHabit);
  await AsyncStorage.setItem(KEYS.HABITS, JSON.stringify(habits));
  return newHabit;
}

export async function deleteHabit(id: string): Promise<void> {
  const habits = await getHabits();
  const filtered = habits.filter((h) => h.id !== id);
  await AsyncStorage.setItem(KEYS.HABITS, JSON.stringify(filtered));
}

export async function getCompletions(): Promise<HabitCompletion[]> {
  const data = await AsyncStorage.getItem(KEYS.COMPLETIONS);
  return data ? JSON.parse(data) : [];
}

export async function getTodayCompletions(): Promise<HabitCompletion[]> {
  const completions = await getCompletions();
  const today = new Date().toDateString();
  return completions.filter(
    (c) => new Date(c.completedAt).toDateString() === today
  );
}

export async function completeHabit(habit: Habit): Promise<HabitCompletion> {
  const completions = await getCompletions();
  const completion: HabitCompletion = {
    id: Crypto.randomUUID(),
    habitId: habit.id,
    habitName: habit.name,
    coinReward: habit.coinReward,
    completedAt: new Date().toISOString(),
  };
  completions.push(completion);
  await AsyncStorage.setItem(KEYS.COMPLETIONS, JSON.stringify(completions));

  const balance = await getBalance();
  await setBalance(balance + habit.coinReward);

  return completion;
}

export async function getRewards(): Promise<Reward[]> {
  const data = await AsyncStorage.getItem(KEYS.REWARDS);
  return data ? JSON.parse(data) : [];
}

export async function saveReward(reward: Omit<Reward, "id" | "createdAt">): Promise<Reward> {
  const rewards = await getRewards();
  const newReward: Reward = {
    ...reward,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  rewards.push(newReward);
  await AsyncStorage.setItem(KEYS.REWARDS, JSON.stringify(rewards));
  return newReward;
}

export async function deleteReward(id: string): Promise<void> {
  const rewards = await getRewards();
  const filtered = rewards.filter((r) => r.id !== id);
  await AsyncStorage.setItem(KEYS.REWARDS, JSON.stringify(filtered));
}

export async function getRedemptions(): Promise<RewardRedemption[]> {
  const data = await AsyncStorage.getItem(KEYS.REDEMPTIONS);
  return data ? JSON.parse(data) : [];
}

export async function redeemReward(reward: Reward): Promise<RewardRedemption | null> {
  const balance = await getBalance();
  if (balance < reward.cost) return null;

  const redemptions = await getRedemptions();
  const redemption: RewardRedemption = {
    id: Crypto.randomUUID(),
    rewardId: reward.id,
    rewardName: reward.name,
    cost: reward.cost,
    redeemedAt: new Date().toISOString(),
  };
  redemptions.push(redemption);
  await AsyncStorage.setItem(KEYS.REDEMPTIONS, JSON.stringify(redemptions));
  await setBalance(balance - reward.cost);

  return redemption;
}

export async function getBalance(): Promise<number> {
  const data = await AsyncStorage.getItem(KEYS.BALANCE);
  return data ? parseInt(data, 10) : 0;
}

export async function setBalance(balance: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.BALANCE, balance.toString());
}

export async function getStreak(habitId: string): Promise<number> {
  const completions = await getCompletions();
  const habitCompletions = completions
    .filter((c) => c.habitId === habitId)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  if (habitCompletions.length === 0) return 0;

  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(currentDate);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toDateString();

    const found = habitCompletions.some(
      (c) => new Date(c.completedAt).toDateString() === dateStr
    );

    if (found) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return streak;
}
