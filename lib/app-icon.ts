import { Platform, NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ICON_STORAGE_KEY = "app_selected_icon";

// Alternate icon definitions
// Icons should be placed in:
//   iOS: asset catalog (Images.xcassets) with alternate icon sets
//   Android: drawable resources referenced in activity-alias in AndroidManifest.xml
export interface AppIcon {
  id: string;          // null for primary icon, or alternate name for others
  name: string;        // Display name
  description: string; // Short description
}

export const APP_ICONS: AppIcon[] = [
  {
    id: "primary",
    name: "Default",
    description: "The original Habit Kingdom icon",
  },
  {
    id: "icon_dark",
    name: "Midnight",
    description: "A dark, moody variant",
  },
  {
    id: "icon_gold",
    name: "Golden Crown",
    description: "A premium gold-themed icon",
  },
];

// Get the currently selected icon ID
export async function getCurrentIcon(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(ICON_STORAGE_KEY);
    return stored || "primary";
  } catch {
    return "primary";
  }
}

// Set the app icon (persisted)
export async function setAppIcon(iconId: string): Promise<boolean> {
  try {
    // For native icon changing, we need:
    // iOS: UIApplication.setAlternateIconName
    // Android: PackageManager.setComponentEnabledSetting for activity-alias

    // On iOS, use the native API directly
    if (Platform.OS === "ios") {
      try {
        // This requires the alternate icons to be configured in the asset catalog
        // The native call: UIApplication.shared.setAlternateIconName(iconId)
        // In Expo managed, this would require a config plugin or prebuild
        const { UIManager } = NativeModules;
        if (UIManager && UIManager.setAlternateIconName) {
          await UIManager.setAlternateIconName(iconId === "primary" ? null : iconId);
        }
      } catch (e) {
        console.log("[AppIcon] iOS native icon change not available:", e);
      }
    }

    // On Android, activity-alias is used in AndroidManifest.xml
    // Switching would require PackageManager calls
    if (Platform.OS === "android") {
      try {
        const { UIManager } = NativeModules;
        if (UIManager && UIManager.setAlternateIcon) {
          await UIManager.setAlternateIcon(iconId);
        }
      } catch (e) {
        console.log("[AppIcon] Android native icon change not available:", e);
      }
    }

    // Always persist the selection so it can be applied on next launch
    await AsyncStorage.setItem(ICON_STORAGE_KEY, iconId);
    return true;
  } catch (error) {
    console.error("[AppIcon] Error setting icon:", error);
    return false;
  }
}
