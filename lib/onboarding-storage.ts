import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_COMPLETE_KEY = "@kidhabit_onboarding_complete";
const ACTIVE_PROFILE_KEY = "@kidhabit_active_profile";
const PROFILES_KEY = "@kidhabit_profiles";

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return value === "true";
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return false;
  }
}

export async function setOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
  } catch (error) {
    console.error("Error saving onboarding status:", error);
  }
}

export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  } catch (error) {
    console.error("Error resetting onboarding status:", error);
  }
}

export async function getActiveProfileId(): Promise<string> {
  try {
    const value = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
    return value || 'default';
  } catch (error) {
    console.error("Error getting active profile:", error);
    return 'default';
  }
}

export async function setActiveProfileId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch (error) {
    console.error("Error saving active profile:", error);
  }
}

export async function getSavedProfiles(): Promise<{ id: string; name: string; type: string }[]> {
  try {
    const value = await AsyncStorage.getItem(PROFILES_KEY);
    return value ? JSON.parse(value) : [];
  } catch (error) {
    console.error("Error getting profiles:", error);
    return [];
  }
}

export async function saveProfiles(profiles: { id: string; name: string; type: string }[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch (error) {
    console.error("Error saving profiles:", error);
  }
}
