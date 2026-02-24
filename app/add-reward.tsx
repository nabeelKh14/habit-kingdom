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
import { saveReward } from "@/lib/storage";
import { REWARD_ICONS, REWARD_COLORS } from "@/lib/habitIcons";

export default function AddRewardScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(REWARD_ICONS[0].name);
  const [selectedColor, setSelectedColor] = useState(REWARD_COLORS[0]);
  const [cost, setCost] = useState("10");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await saveReward({
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor,
      cost: parseInt(cost, 10) || 10,
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
          <Text style={styles.headerTitle}>New Reward</Text>
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
          <Text style={styles.label}>Reward Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 30 min screen time"
            placeholderTextColor={Colors.textLight}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.label}>Cost (coins)</Text>
          <View style={styles.costSelector}>
            {["5", "10", "15", "20", "30", "50"].map((val) => (
              <Pressable
                key={val}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCost(val);
                }}
                style={[
                  styles.costChip,
                  cost === val && {
                    backgroundColor: Colors.accent,
                    borderColor: Colors.accent,
                  },
                ]}
              >
                <Ionicons
                  name="diamond"
                  size={12}
                  color={cost === val ? "#fff" : Colors.accent}
                />
                <Text
                  style={[
                    styles.costChipText,
                    cost === val && { color: "#fff" },
                  ]}
                >
                  {val}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Icon</Text>
          <View style={styles.iconGrid}>
            {REWARD_ICONS.map((icon) => (
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
            {REWARD_COLORS.map((color) => (
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
                  size={28}
                  color={selectedColor}
                />
              </View>
              <Text style={styles.previewName}>
                {name || "Reward Name"}
              </Text>
              <View style={styles.previewCostBadge}>
                <Ionicons name="diamond" size={12} color={Colors.accent} />
                <Text style={styles.previewCostText}>{cost || "10"}</Text>
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
  costSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  costChip: {
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
  costChipText: {
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
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  previewIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  previewName: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  previewCostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.accent + "15",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  previewCostText: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.accentDark,
  },
});
