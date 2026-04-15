import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  MIDDAY_REMINDER_ENABLED: "settings_midday_reminder_enabled",
  MIDDAY_REMINDER_TIME: "settings_midday_reminder_time",
  NIGHT_REMINDER_ENABLED: "settings_night_reminder_enabled",
  NIGHT_REMINDER_TIME: "settings_night_reminder_time",
  BONUS_AMOUNT: "settings_bonus_amount",
  PENALTY_AMOUNT: "settings_penalty_amount",
};

export interface ReminderSettings {
  middayEnabled: boolean;
  middayTime: string; // "HH:mm"
  nightEnabled: boolean;
  nightTime: string; // "HH:mm"
  bonusAmount: number;
  penaltyAmount: number;
}

const DEFAULT_SETTINGS: ReminderSettings = {
  middayEnabled: false,
  middayTime: "12:00",
  nightEnabled: false,
  nightTime: "21:00",
  bonusAmount: 10,
  penaltyAmount: 10,
};

export async function getReminderSettings(): Promise<ReminderSettings> {
  try {
    const [middayEnabled, middayTime, nightEnabled, nightTime, bonusAmount, penaltyAmount] = await Promise.all([
      AsyncStorage.getItem(KEYS.MIDDAY_REMINDER_ENABLED),
      AsyncStorage.getItem(KEYS.MIDDAY_REMINDER_TIME),
      AsyncStorage.getItem(KEYS.NIGHT_REMINDER_ENABLED),
      AsyncStorage.getItem(KEYS.NIGHT_REMINDER_TIME),
      AsyncStorage.getItem(KEYS.BONUS_AMOUNT),
      AsyncStorage.getItem(KEYS.PENALTY_AMOUNT),
    ]);

    return {
      middayEnabled: middayEnabled === "true",
      middayTime: middayTime || DEFAULT_SETTINGS.middayTime,
      nightEnabled: nightEnabled === "true",
      nightTime: nightTime || DEFAULT_SETTINGS.nightTime,
      bonusAmount: bonusAmount ? parseInt(bonusAmount, 10) : DEFAULT_SETTINGS.bonusAmount,
      penaltyAmount: penaltyAmount ? parseInt(penaltyAmount, 10) : DEFAULT_SETTINGS.penaltyAmount,
    };
  } catch (error) {
    console.error("Error loading reminder settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(KEYS.MIDDAY_REMINDER_ENABLED, settings.middayEnabled.toString()),
      AsyncStorage.setItem(KEYS.MIDDAY_REMINDER_TIME, settings.middayTime),
      AsyncStorage.setItem(KEYS.NIGHT_REMINDER_ENABLED, settings.nightEnabled.toString()),
      AsyncStorage.setItem(KEYS.NIGHT_REMINDER_TIME, settings.nightTime),
      AsyncStorage.setItem(KEYS.BONUS_AMOUNT, settings.bonusAmount.toString()),
      AsyncStorage.setItem(KEYS.PENALTY_AMOUNT, settings.penaltyAmount.toString()),
    ]);
  } catch (error) {
    console.error("Error saving reminder settings:", error);
    throw error;
  }
}
