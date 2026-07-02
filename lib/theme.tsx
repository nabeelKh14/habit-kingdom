/**
 * Dark Mode theming system for Habit Kingdom.
 *
 * Provides a React Context + hook for theme-aware components.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useColorScheme, Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentLight: string;
  error: string;
  success: string;
  warning: string;
  border: string;
  card: string;
  tabBar: string;
  tabBarInactive: string;
  overlay: string;
}

const LIGHT_THEME: ThemeColors = {
  background: "#F8F9FA",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F2F5",
  text: "#1A1A2E",
  textSecondary: "#6B7280",
  accent: "#4A90D9",
  accentLight: "#E8F0FE",
  error: "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",
  border: "#E5E7EB",
  card: "#FFFFFF",
  tabBar: "#FFFFFF",
  tabBarInactive: "#9CA3AF",
  overlay: "rgba(0, 0, 0, 0.5)",
};

const DARK_THEME: ThemeColors = {
  background: "#0F172A",
  surface: "#1E293B",
  surfaceAlt: "#334155",
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  accent: "#60A5FA",
  accentLight: "#1E3A5F",
  error: "#F87171",
  success: "#34D399",
  warning: "#FBBF24",
  border: "#334155",
  card: "#1E293B",
  tabBar: "#1E293B",
  tabBarInactive: "#64748B",
  overlay: "rgba(0, 0, 0, 0.7)",
};

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  colors: LIGHT_THEME,
  isDark: false,
  setMode: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "@habit-kingdom/theme-mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setModeState(saved);
      }
    });
  }, []);

  const resolvedDark = mode === "dark" || (mode === "system" && systemScheme === "dark");
  const colors = resolvedDark ? DARK_THEME : LIGHT_THEME;

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setMode(resolvedDark ? "light" : "dark");
  }, [resolvedDark, setMode]);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        colors,
        isDark: resolvedDark,
        setMode,
        toggle,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

export const theme = {
  light: LIGHT_THEME,
  dark: DARK_THEME,
};
