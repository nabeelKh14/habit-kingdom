import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { saveHabit } from "@/lib/storage";
import { HABIT_ICONS, HABIT_COLORS } from "@/lib/habitIcons";

export default function AddHabitScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(HABIT_ICONS[0].name);
  const [selectedColor, setSelectedColor] = useState(HABIT_COLORS[0]);
  const [coinReward, setCoinReward] = useState("5");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await saveHabit({
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor,
      coinReward: parseInt(coinReward, 10) || 5,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const canSave = name.trim().length > 0 && !saving;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <View style={[styles.container, { paddingTop: insets.top + webTopPadding }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>New Habit</Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && { opacity: 0.4 }]}
          >
            <Ionicons name="checkmark" size={24} color="#fff" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={styles.label}>Habit Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Read for 20 minutes"
            placeholderTextColor={Colors.textLight}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.label}>Coin Reward</Text>
          <View style={styles.rewardSelector}>
            {["1", "2", "5", "10", "15", "20"].map((val) => (
              <Pressable
                key={val}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCoinReward(val);
                }}
                style={[
                  styles.rewardChip,
                  coinReward === val && {
                    backgroundColor: Colors.accent,
                    borderColor: Colors.accent,
                  },
                ]}
              >
                <Ionicons
                  name="diamond"
                  size={12}
                  color={coinReward === val ? "#fff" : Colors.accent}
                />
                <Text
                  style={[
                    styles.rewardChipText,
                    coinReward === val && { color: "#fff" },
                  ]}
                >
                  {val}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Icon</Text>
          <View style={styles.iconGrid}>
            {HABIT_ICONS.map((icon) => (
              <Pressable
                key={icon.name}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedIcon(icon.name);
                }}
                style={[
                  styles.iconOption,
                  selectedIcon === icon.name && {
                    backgroundColor: selectedColor + "20",
                    borderColor: selectedColor,
                  },
                ]}
              >
                <Feather
                  name={icon.name as any}
                  size={22}
                  color={
                    selectedIcon === icon.name
                      ? selectedColor
                      : Colors.textSecondary
                  }
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Color</Text>
          <View style={styles.colorGrid}>
            {HABIT_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedColor(color);
                }}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorOptionSelected,
                ]}
              >
                {selectedColor === color && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </Pressable>
            ))}
          </View>

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Preview</Text>
            <View style={styles.previewCard}>
              <View
                style={[
                  styles.previewIcon,
                  { backgroundColor: selectedColor + "18" },
                ]}
              >
                <Feather
                  name={selectedIcon as any}
                  size={22}
                  color={selectedColor}
                />
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName}>
                  {name || "Habit Name"}
                </Text>
                <View style={styles.previewMeta}>
                  <Ionicons name="diamond" size={12} color={Colors.accent} />
                  <Text style={styles.previewReward}>
                    +{coinReward || "5"} coins
                  </Text>
                </View>
              </View>
              <View style={styles.previewCheck}>
                <View style={styles.previewCheckInner} />
              </View>
            </View>
          </View>

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  saveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: "Nunito_500Medium",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rewardSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rewardChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  rewardChipText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  preview: {
    marginTop: 24,
  },
  previewLabel: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  previewCard: {
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
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  previewInfo: {
    flex: 1,
    marginLeft: 12,
  },
  previewName: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  previewMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  previewReward: {
    fontSize: 12,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
  },
  previewCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  previewCheckInner: {},
});
