import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "../constants/colors";
import { saveReward, getRewards, updateReward as updateRewardStorage, type Reward, getProfiles, type Profile } from "../lib/storage";
import { getActiveProfileId } from "../lib/onboarding-storage";
import { REWARD_ICONS, REWARD_COLORS } from "../lib/habitIcons";

export default function AddRewardScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const editRewardId = params.id as string | undefined;
  const isEditMode = !!editRewardId;
  
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(REWARD_ICONS[0].name);
  const [selectedColor, setSelectedColor] = useState(REWARD_COLORS[0]);
  const [cost, setCost] = useState("50");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  // Load reward data for edit mode
  useEffect(() => {
    loadData();
  }, [editRewardId]);

  const loadData = async () => {
    try {
      const allProfiles = await getProfiles();
      setProfiles(allProfiles);
      const currentActiveProfileId = await getActiveProfileId();
      let initialProfileId = currentActiveProfileId;

      if (isEditMode) {
        const rewards = await getRewards();
        const reward = rewards.find(r => r.id === editRewardId);
        if (reward) {
          setName(reward.name);
          setSelectedIcon(reward.icon);
          setSelectedColor(reward.color);
          setCost(reward.cost.toString());
          if (reward.profileId) initialProfileId = reward.profileId;
        } else {
          // Reward not found - navigate back and show error
          Alert.alert('Error', 'Reward not found.');
          router.back();
          return;
        }
      }
      setSelectedProfileId(initialProfileId);
    } catch (error) {
      console.error('Error loading data for reward:', error);
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const finalCost = parseInt(cost, 10) || 50;
      
      if (isEditMode) {
        // Update existing reward
        await updateRewardStorage({
          id: editRewardId,
          name: name.trim(),
          icon: selectedIcon,
          color: selectedColor,
          cost: finalCost,
          profileId: selectedProfileId,
        });
      } else {
        // Create new reward
        await saveReward({
          name: name.trim(),
          icon: selectedIcon,
          color: selectedColor,
          cost: finalCost,
          profileId: selectedProfileId,
        });
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      console.error('Error saving reward:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg('Failed to save reward. Please try again.');
      setSaving(false);
    }
  };

  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const canSave = name.trim().length > 0 && !saving;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.container, { paddingTop: insets.top + webTopPadding, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={26} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{isEditMode ? 'Edit Reward' : 'New Reward'}</Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave || loading}
            style={[styles.saveButton, (!canSave || loading) && { opacity: 0.4 }]}
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
          <Text style={styles.label}>Profile</Text>
          <View style={styles.profileSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {profiles.map(p => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedProfileId(p.id);
                  }}
                  style={[
                    styles.profileChip,
                    selectedProfileId === p.id && {
                      backgroundColor: Colors.primary,
                      borderColor: Colors.primary,
                    }
                  ]}
                >
                  <Ionicons 
                    name={p.type === 'child' ? 'happy' : 'person'} 
                    size={16} 
                    color={selectedProfileId === p.id ? "#fff" : Colors.textSecondary} 
                  />
                  <Text style={[
                    styles.profileChipText,
                    selectedProfileId === p.id && { color: "#fff" }
                  ]}>{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.label}>Reward Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 30 min screen time"
            placeholderTextColor={Colors.textLight}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.label}>Cost (points)</Text>
          <View style={styles.costSelector}>
            {["50", "100", "150", "200", "300", "500"].map((val) => (
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
              <Text style={styles.previewName} numberOfLines={2}>
                {name || "Reward Name"}
              </Text>
              <View style={styles.previewCostBadge}>
                <Ionicons name="diamond" size={12} color={Colors.accent} />
                 <Text style={styles.previewCostText}>{parseInt(cost) || 50}</Text>
              </View>
            </View>
          </View>

        </ScrollView>

        {/* Custom Error Modal */}
        <Modal
          visible={!!errorMsg}
          transparent
          animationType="fade"
          onRequestClose={() => setErrorMsg(null)}
        >
          <View style={styles.errorModalOverlay}>
            <View style={styles.errorModalContent}>
              <View style={styles.errorModalIconContainer}>
                <Ionicons name="alert-circle" size={48} color={Colors.error} />
              </View>
              <Text style={styles.errorModalTitle}>Oops! 🙀</Text>
              <Text style={styles.errorModalText}>{errorMsg}</Text>
              <Pressable
                style={styles.errorModalButton}
                onPress={() => setErrorMsg(null)}
              >
                <Text style={styles.errorModalButtonText}>Try Again</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.error + '15',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: Colors.error,
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 14,
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
    flexShrink: 1,
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
  errorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  errorModalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.error + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorModalTitle: {
    fontSize: 22,
    fontFamily: 'Nunito_800ExtraBold',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorModalText: {
    fontSize: 16,
    fontFamily: 'Nunito_500Medium',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  errorModalButton: {
    backgroundColor: Colors.error,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  errorModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
  },
});
