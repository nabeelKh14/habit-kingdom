import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { OfflineBanner } from "../components/OfflineBanner";
import { queryClient } from "../lib/query-client";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { isOnboardingComplete, setOnboardingComplete, getActiveProfileId } from "../lib/onboarding-storage";
import { setActiveProfileId, getProfiles } from "../lib/storage";
import { supabase } from "../lib/supabase";
import OnboardingScreen from "./onboarding";
import Colors from "../constants/colors";
import { initMonitoring, captureError as captureMonitoringError } from "../lib/monitoring";

SplashScreen.preventAutoHideAsync();

// Boot monitoring (Sentry + PostHog) as early as possible.
// Env-gated: no-ops when keys are absent.
initMonitoring().catch((e) => console.warn("[Monitoring] boot failed:", e));

// =========================================================================
// NOTIFICATION HANDLER — dynamically loaded to avoid Expo Go crash
// =========================================================================
function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        // Dynamic import — expo-notifications crashes in Expo Go, works in dev/preview builds
        const Notifications = await import("expo-notifications");

        // 1. Tap handler: navigate to habits tab when notification is tapped
        const sub = Notifications.default.addNotificationResponseReceivedListener((response) => {
          console.log("[Notifications] Tapped notification:", response.notification.request.identifier);
          const data = response.notification.request.content.data;
          if (data?.habitId) {
            // Navigate to main tabs — user can see their habits
            router.push("/(tabs)");
          } else if (data?.type === "habit_reminder" || data?.type === "midday_reminder" || data?.type === "night_reminder") {
            router.push("/(tabs)");
          }
        });

        cleanup = () => sub.remove();
      } catch (e) {
        console.warn("[Notifications] Tap handler skipped (Expo Go):", e);
      }
    })();

    return () => cleanup?.();
  }, [router]);

  return null;
}

// =========================================================================
// PUSH TOKEN REGISTRATION — runs after onboarding is done
// =========================================================================
function PushTokenRegistration() {
  useEffect(() => {
    (async () => {
      try {
        const Notifications = await import("expo-notifications");

        // 2. Get Expo push token
        const { status: permStatus } = await Notifications.default.getPermissionsAsync();
        if (permStatus !== "granted") {
          console.log("[Notifications] Permissions not granted, skipping token registration");
          return;
        }

        const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
        if (!projectId) {
          console.log("[Notifications] No EXPO_PUBLIC_PROJECT_ID set, using generic token");
        }

        const expoPushToken = await Notifications.default.getExpoPushTokenAsync({
          projectId: projectId ?? undefined,
        });
        const tokenStr = expoPushToken.data;

        if (!tokenStr) {
          console.log("[Notifications] No push token returned");
          return;
        }

        console.log("[Notifications] Got Expo push token:", tokenStr.slice(0, 20) + "...");

        // 3. Register token with our server
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.warn("[Notifications] No session, cannot register token");
          return;
        }

        const apiUrl = process.env.EXPO_PUBLIC_API_URL;
        if (!apiUrl) {
          console.log("[Notifications] No API URL — token registration skipped (offline/standalone mode)");
          return;
        }

        const platform = Platform.OS === "ios" ? "ios" : "android";
        const response = await fetch(`${apiUrl}/api/v1/notifications/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token: tokenStr, platform }),
        });

        const result = await response.json();
        if (result.success) {
          console.log(`[Notifications] Token registered successfully (${result.tokenCount} tokens)`);
        } else {
          console.warn("[Notifications] Token registration failed:", result);
        }
      } catch (e) {
        console.warn("[Notifications] Token registration skipped (Expo Go or network error):", e);
      }
    })();
  }, []);

  return null;
}

// =========================================================================
// ROOT LAYOUT NAV
// =========================================================================
function RootLayoutNav() {
  // Request notification permissions + init handler on app start
  useEffect(() => {
    (async () => {
      try {
        const { initNotifications } = await import("../lib/notifications");
        initNotifications();
      } catch (e) {
        console.warn("[Notifications] Init skipped (Expo Go):", e);
      }
    })();
  }, []);

  return (
    <>
      <NotificationHandler />
      <PushTokenRegistration />
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-habit"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="add-reward"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            presentation: "modal",
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

// =========================================================================
// ROOT LAYOUT EXPORT
// =========================================================================
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check onboarding status and session on mount
  useEffect(() => {
    async function checkSessionAndOnboarding() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const complete = await isOnboardingComplete();

        // The app is local-first: onboarding completion is the source of truth.
        // We do NOT require a Supabase session to leave onboarding — getSession()
        // returns null when auth is unconfigured/offline, and gating on it would
        // trap the user in onboarding forever (re-shown on every launch). If a
        // session exists we use it; otherwise we proceed in local-only mode.
        setShowOnboarding(!complete);

        if (complete) {
          // Initialize profiles (create default if none exist)
          const { initializeProfiles } = await import("../lib/storage");
          await initializeProfiles();

          // Initialize active profile from storage
          const activeId = await getActiveProfileId();
          setActiveProfileId(activeId);

          // Sync profiles from database to onboarding storage
          const profiles = await getProfiles();
          if (profiles.length > 0) {
            const { saveProfiles } = await import("../lib/onboarding-storage");
            await saveProfiles(profiles.map(p => ({ id: p.id, name: p.name, type: p.type })));
          }

          // Run background sync with Supabase
          const { syncWithSupabase } = await import("../lib/sync");
          syncWithSupabase().then(res => {
            if (res.success) {
              console.log("[SUPABASE] Background sync completed:", res.message);
            } else {
              console.log("[SUPABASE] Background sync skipped:", res.message);
            }
          }).catch(err => {
            console.error("[SUPABASE] Background sync error:", err);
          });

          // Pull remote feature flags from the Express server so runtime flags
          // (remote feature flags DoD) are live, not just hardcoded defaults.
          const { fetchFeatureFlags } = await import("../lib/feature-flags");
          fetchFeatureFlags(activeId).catch(err => {
            console.warn("[FeatureFlags] Remote load failed (defaults kept):", err);
          });
        }
      } catch (error) {
        console.error("Error checking session/onboarding:", error);
        setShowOnboarding(true);
      } finally {
        setIsLoading(false);
      }
    }

    checkSessionAndOnboarding();
  }, []);

  useEffect(() => {
    console.log("[DEBUG] Fonts loaded:", fontsLoaded, "Error:", fontError);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      console.log("[DEBUG] Hiding splash screen - fonts loaded");
      SplashScreen.hideAsync();
    } else if (fontError) {
      console.log("[DEBUG] Font error - hiding splash anyway:", fontError);
      // Hide splash even if fonts fail - prevent stuck screen
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const handleOnboardingComplete = async () => {
    await setOnboardingComplete();
    setShowOnboarding(false);
  };

  // Wait for fonts and onboarding check to complete
  if ((!fontsLoaded && !fontError) || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Show onboarding on first launch
  if (showOnboarding === true) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  // Even if fonts failed, we proceed - don't get stuck on splash
  console.log("[DEBUG] Proceeding to render app, fontsLoaded:", fontsLoaded);

  return (
    <ErrorBoundary onError={(error) => captureMonitoringError(error)}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <OfflineBanner />
            <RootLayoutNav />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
});