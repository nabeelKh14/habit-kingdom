import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { queryClient } from "../lib/query-client";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
// Note: expo-notifications doesn't work in Expo Go SDK 53+
// We wrap it in a try/catch or conditional import if needed, 
// but for now we just comment it out to prevent the instant crash on boot.
// import * as Notifications from "expo-notifications";
import { requestNotificationPermissions } from "../lib/notifications";
import { isOnboardingComplete, setOnboardingComplete, getActiveProfileId } from "../lib/onboarding-storage";
import { setActiveProfileId, getProfiles } from "../lib/storage";
import { supabase } from "../lib/supabase";
import OnboardingScreen from "./onboarding";
import Colors from "../constants/colors";

SplashScreen.preventAutoHideAsync();

// Handle notification responses
function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    // Disabled for Expo Go compatibility
    /*
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const habitId = response.notification.request.content.data?.habitId;
      if (habitId) {
        // Navigate to habits tab when notification is tapped
        router.push("/(tabs)");
      }
    });

    return () => subscription.remove();
    */
  }, [router]);

  return null;
}

function RootLayoutNav() {
  // Request notification permissions on app start (only if not already granted)
  useEffect(() => {
    const checkAndRequestPermissions = async () => {
      try {
        // Disabled for Expo Go compatibility
        // const { status } = await Notifications.getPermissionsAsync();
        // if (status !== 'granted') {
        //  await requestNotificationPermissions();
        // }
      } catch (e) {
        console.warn("Notifications check failed (expected in Expo Go):", e);
      }
    };
    checkAndRequestPermissions();
  }, []);

  return (
    <>
      <NotificationHandler />
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
        
        // If there's no active session, we require login/onboarding
        setShowOnboarding(!session || !complete);
        
        if (session && complete) {
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
              console.log('[SUPABASE] Background sync completed:', res.message);
            } else {
              console.log('[SUPABASE] Background sync skipped:', res.message);
            }
          }).catch(err => {
            console.error('[SUPABASE] Background sync error:', err);
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

  // Debug: Log font loading status
  useEffect(() => {
    console.log('[DEBUG] Fonts loaded:', fontsLoaded, 'Error:', fontError);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      console.log('[DEBUG] Hiding splash screen - fonts loaded');
      SplashScreen.hideAsync();
    } else if (fontError) {
      console.log('[DEBUG] Font error - hiding splash anyway:', fontError);
      // Hide splash even if fonts fail - prevent stuck screen
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  const handleOnboardingComplete = async () => {
    await setOnboardingComplete();
    setShowOnboarding(false);
  };

  // Wait for fonts and onboarding check to complete
  if (!fontsLoaded && !fontError || isLoading) {
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
  console.log('[DEBUG] Proceeding to render app, fontsLoaded:', fontsLoaded);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
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
