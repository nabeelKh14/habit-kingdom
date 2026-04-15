import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Habit } from './storage';
import { isHabitPaused } from './storage';
import { isEnabled } from './feature-flags';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const MOTIVATIONAL_MESSAGES = [
  "Time to build a great habit! 🌟 🐻",
  "Your future self will thank you! 💪 🐶",
  "Don't break the streak! 🔥 🦁",
  "You've got this! ⭐ 🐯",
  "Building habits, one day at a time! 🎯 🐻",
  "Keep up the amazing work! 🚀 🐶",
  "Make today count! ✨ 🦁",
];

// Request notification permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permissions not granted');
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('habits', {
      name: 'Habit Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4A90D9',
    });
  }

  return true;
}

// Check if notifications are permitted (without requesting)
export async function hasNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// Schedule notifications for a habit
export async function scheduleHabitNotifications(habit: Habit): Promise<void> {
  // Cancel existing notifications for this habit first
  await cancelHabitNotifications(habit.id);

  // Don't schedule for paused habits
  if (isHabitPaused(habit)) {
    console.log('[Notifications] Skipping paused habit:', habit.id, habit.name);
    return;
  }

  // Validate notificationTime before processing
  if (!habit.notificationsEnabled || !habit.notificationTime) {
    console.log('[Notifications] Notifications disabled or no notificationTime for habit:', habit.id);
    return;
  }

  // Validate notificationTime format
  if (typeof habit.notificationTime !== 'string' || !habit.notificationTime.includes(':')) {
    console.error('[Notifications] Invalid notificationTime format:', habit.notificationTime);
    return;
  }

  const timeParts = habit.notificationTime.split(':');
  if (timeParts.length !== 2) {
    console.error('[Notifications] Invalid notificationTime format:', habit.notificationTime);
    return;
  }

  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);

  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    console.error('[Notifications] Invalid time values:', hours, minutes);
    return;
  }

  console.log('[Notifications] Scheduling notification for habit:', habit.id, 'at', habit.notificationTime);

  // Get the trigger based on frequency
  const trigger = getNotificationTrigger(habit, hours, minutes);

  if (!trigger) {
    console.log('[Notifications] No trigger generated for habit:', habit.id);
    return;
  }

  const randomMessage = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🔔 ${habit.name}`,
      body: randomMessage,
      data: { habitId: habit.id },
      sound: true,
    },
    trigger,
  });
}

// Get the appropriate trigger based on habit frequency
function getNotificationTrigger(habit: Habit, hours: number, minutes: number): Notifications.NotificationTriggerInput | null {
  // Check feature flag for weekly/monthly notifications
  const useWeeklyMonthly = isEnabled('WEEKLY_MONTHLY_NOTIFICATIONS');

  switch (habit.frequency) {
    case 'daily':
      return {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      };

    case 'weekly':
      if (useWeeklyMonthly && habit.daysOfWeek && habit.daysOfWeek.length > 0) {
        // Schedule for each selected day of the week
        return {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          hour: hours,
          minute: minutes,
          weekday: habit.daysOfWeek[0] + 1, // Convert 0-6 to 1-7 (Sunday = 1)
          repeats: true,
        };
      }
      // Fallback: daily notification (as documented in UI)
      return {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      };

    case 'monthly':
      if (useWeeklyMonthly && habit.dayOfMonth) {
        // Monthly trigger - schedule for specific day of month
        return {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          hour: hours,
          minute: minutes,
          day: habit.dayOfMonth,
          repeats: true,
        };
      }
      // Fallback: daily notification (as documented in UI)
      return {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      };

    case 'once':
    default:
      // For one-time habits, schedule a single notification at the due date
      return null;
  }
}

// Cancel all notifications for a habit
export async function cancelHabitNotifications(habitId: string): Promise<void> {
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  
  const habitNotifications = scheduledNotifications.filter(
    notification => notification.content.data?.habitId === habitId
  );

  for (const notification of habitNotifications) {
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
  }
}

// Cancel all scheduled notifications
export async function cancelAllHabitNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Update notification settings for a habit
export async function updateHabitNotifications(habit: Habit): Promise<void> {
  if (isHabitPaused(habit)) {
    await cancelHabitNotifications(habit.id);
    return;
  }
  
  if (habit.notificationsEnabled) {
    await scheduleHabitNotifications(habit);
  } else {
    await cancelHabitNotifications(habit.id);
  }
}

// Get all scheduled notifications (for debugging)
export async function getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  return await Notifications.getAllScheduledNotificationsAsync();
}

// Schedule global mid-day reminder
export async function scheduleMiddayReminder(time: string): Promise<void> {
  await cancelMiddayReminder();

  const [hoursStr, minutesStr] = time.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(hours) || isNaN(minutes)) {
    console.error('[Notifications] Invalid midday reminder time:', time);
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "☀️ Mid-day Check-in 🐻",
      body: "How are your habits going? Take a moment to log your progress! 🐶",
      data: { type: "midday_reminder" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });
}

export async function cancelMiddayReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.type === "midday_reminder") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// Schedule global night reminder
export async function scheduleNightReminder(time: string): Promise<void> {
  await cancelNightReminder();

  const [hoursStr, minutesStr] = time.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(hours) || isNaN(minutes)) {
    console.error('[Notifications] Invalid night reminder time:', time);
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🌙 End of Day Reminder 😿",
      body: "Don't forget to complete your habits before the day ends! The kingdom needs you! 🐻💧",
      data: { type: "night_reminder" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
    },
  });
}

export async function cancelNightReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.content.data?.type === "night_reminder") {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}
