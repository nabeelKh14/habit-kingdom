import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Switch,
  ScrollView,
  Modal,
  Platform,
  Alert,
  Image,
  TextInput,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "../constants/colors";
import {
  getReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from "../lib/settings-storage";
import {
  getProfiles,
  renameProfile,
  removeProfile,
  createProfile,
  type Profile,
} from "../lib/storage";
import {
  requestNotificationPermissions,
  scheduleMiddayReminder,
  cancelMiddayReminder,
  scheduleNightReminder,
  cancelNightReminder,
} from "../lib/notifications";
import {
  APP_ICONS,
  getCurrentIcon,
  setAppIcon,
} from "../lib/app-icon";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<ReminderSettings>({
    middayEnabled: false,
    middayTime: "12:00",
    nightEnabled: false,
    nightTime: "21:00",
    bonusAmount: 10,
    penaltyAmount: 10,
  });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingField, setEditingField] = useState<'midday' | 'night'>('midday');
  const [selectedIconId, setSelectedIconId] = useState('primary');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showAddParentModal, setShowAddParentModal] = useState(false);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Wheel picker state
  const [wheelHours, setWheelHours] = useState(12);
  const [wheelMinutes, setWheelMinutes] = useState(0);
  const [wheelPeriod, setWheelPeriod] = useState<'AM' | 'PM'>('PM');

  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const periodScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [s, icon, p] = await Promise.all([
        getReminderSettings(),
        getCurrentIcon(),
        getProfiles(),
      ]);
      setSettings(s);
      setSelectedIconId(icon);
      setProfiles(p);
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const parseTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return { hours: h || 0, minutes: m || 0 };
  };

  const wheelTo24Hour = (hours: number, period: 'AM' | 'PM') => {
    if (period === 'AM') return hours === 12 ? 0 : hours;
    return hours === 12 ? 12 : hours + 12;
  };

  const formatTimeDisplay = (timeStr: string) => {
    const { hours, minutes } = parseTime(timeStr);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const initWheelFromTime = (timeStr: string) => {
    const { hours, minutes } = parseTime(timeStr);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    setWheelHours(displayHours);
    setWheelMinutes(minutes);
    setWheelPeriod(period);
  };

  const scrollToWheelPosition = () => {
    setTimeout(() => {
      hoursScrollRef.current?.scrollTo({ y: (wheelHours - 1) * 44, animated: false });
      minutesScrollRef.current?.scrollTo({ y: wheelMinutes * 44, animated: false });
      periodScrollRef.current?.scrollTo({ y: (wheelPeriod === 'AM' ? 0 : 1) * 44, animated: false });
    }, 100);
  };

  const openTimePicker = (field: 'midday' | 'night') => {
    setEditingField(field);
    const time = field === 'midday' ? settings.middayTime : settings.nightTime;
    initWheelFromTime(time);
    setShowTimePicker(true);
    scrollToWheelPosition();
  };

  const handleSetTime = () => {
    const hours24 = wheelTo24Hour(wheelHours, wheelPeriod);
    const h = hours24.toString().padStart(2, '0');
    const m = wheelMinutes.toString().padStart(2, '0');
    const timeStr = `${h}:${m}`;

    if (editingField === 'midday') {
      updateSettings({ ...settings, middayTime: timeStr });
    } else {
      updateSettings({ ...settings, nightTime: timeStr });
    }
    setShowTimePicker(false);
  };

  const updateSettings = async (newSettings: ReminderSettings) => {
    setSettings(newSettings);
    try {
      await saveReminderSettings(newSettings);

      // Schedule or cancel notifications
      if (newSettings.middayEnabled) {
        const hasPermission = await requestNotificationPermissions();
        if (hasPermission) {
          await scheduleMiddayReminder(newSettings.middayTime);
        }
      } else {
        await cancelMiddayReminder();
      }

      if (newSettings.nightEnabled) {
        const hasPermission = await requestNotificationPermissions();
        if (hasPermission) {
          await scheduleNightReminder(newSettings.nightTime);
        }
      } else {
        await cancelNightReminder();
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const toggleMidday = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value) {
      const hasPermission = await requestNotificationPermissions();
      if (!hasPermission) {
        Alert.alert(
          "Notifications Disabled",
          "Please enable notifications in Settings to receive midday reminders.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }
    }
    updateSettings({ ...settings, middayEnabled: value });
  };

  const toggleNight = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value) {
      const hasPermission = await requestNotificationPermissions();
      if (!hasPermission) {
        Alert.alert(
          "Notifications Disabled",
          "Please enable notifications in Settings to receive night reminders.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return;
      }
    }
    updateSettings({ ...settings, nightEnabled: value });
  };

  const handleRenameProfile = (profile: Profile) => {
    setEditingProfile(profile);
    setInputValue(profile.name);
    setShowRenameModal(true);
  };

  const handleSaveRename = async () => {
    if (!editingProfile || !inputValue.trim()) {
      setShowRenameModal(false);
      return;
    }
    
    try {
      await renameProfile(editingProfile.id, inputValue.trim());
      setProfiles(await getProfiles());
    } catch (e) {
      Alert.alert("Error", "Could not rename profile");
    }
    setShowRenameModal(false);
    setEditingProfile(null);
    setInputValue('');
  };

  const handleRemoveProfile = (profile: Profile) => {
    if (profile.type === 'child') {
      Alert.alert("Cannot Remove", "The child profile cannot be removed.");
      return;
    }
    if (profiles.filter(p => p.type === 'parent').length <= 1) {
      Alert.alert("Cannot Remove", "At least one parent profile is required.");
      return;
    }
    Alert.alert(
      "Remove Parent",
      `Are you sure you want to remove ${profile.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            try {
              await removeProfile(profile.id);
              setProfiles(await getProfiles());
            } catch (e) {
              Alert.alert("Error", "Could not remove profile");
            }
          }
        }
      ]
    );
  };

  const handleAddParent = () => {
    if (profiles.filter(p => p.type === 'parent').length >= 2) {
      Alert.alert("Limit Reached", "You can only have up to 2 parent profiles.");
      return;
    }
    setInputValue('');
    setShowAddParentModal(true);
  };

  const handleSaveAddParent = async () => {
    if (!inputValue.trim()) {
      setShowAddParentModal(false);
      return;
    }
    
    try {
      await createProfile(inputValue.trim(), 'parent');
      setProfiles(await getProfiles());
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not add parent");
    }
    setShowAddParentModal(false);
    setInputValue('');
  };

  const handleAddChild = () => {
    if (profiles.some(p => p.type === 'child')) {
      Alert.alert("Limit Reached", "Only one child profile is allowed.");
      return;
    }
    setInputValue('');
    setShowAddChildModal(true);
  };

  const handleSaveAddChild = async () => {
    if (!inputValue.trim()) {
      setShowAddChildModal(false);
      return;
    }
    
    try {
      await createProfile(inputValue.trim(), 'child');
      setProfiles(await getProfiles());
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not add child");
    }
    setShowAddChildModal(false);
    setInputValue('');
  };

  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const hourOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);
  const periodOptions: ('AM' | 'PM')[] = ['AM', 'PM'];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopPadding, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profiles */}
         <View style={styles.sectionHeaderContainer}>
           <Text style={styles.sectionTitle}>Profiles</Text>
           <View style={styles.profileButtonsContainer}>
             {!profiles.some(p => p.type === 'child') && (
               <Pressable 
                 onPress={handleAddChild} 
                 style={styles.addChildButton}
               >
                 <Ionicons name="add-circle" size={20} color={Colors.primary} />
                 <Text style={styles.addChildText}>Add Child</Text>
               </Pressable>
             )}
             <Pressable 
               onPress={handleAddParent} 
               style={[
                 styles.addParentButton, 
                 profiles.filter(p => p.type === 'parent').length >= 2 && { opacity: 0.5 }
               ]}
               disabled={profiles.filter(p => p.type === 'parent').length >= 2}
             >
               <Ionicons name="add-circle" size={20} color={Colors.primary} />
               <Text style={styles.addParentText}>Add Parent</Text>
             </Pressable>
           </View>
          </View>
        <Text style={styles.sectionDescription}>
          Manage family profiles. You can rename profiles or remove parents.
        </Text>

        <View style={styles.profilesList}>
          {profiles.map((profile, index) => (
            <View key={profile.id} style={[styles.profileCard, index === 0 && { borderTopWidth: 0 }]}>
              <View style={[styles.settingIcon, { backgroundColor: profile.type === 'child' ? Colors.primary + "20" : Colors.primaryDark + "20" }]}>
                <Ionicons name={profile.type === 'child' ? "happy" : "person"} size={22} color={profile.type === 'child' ? Colors.primary : Colors.primaryDark} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>{profile.name}</Text>
                <Text style={styles.settingDescription}>{profile.type === 'child' ? 'Kid' : 'Parent'}</Text>
              </View>
              <View style={styles.profileActions}>
                <Pressable onPress={() => handleRenameProfile(profile)} style={styles.profileActionButton}>
                  <Ionicons name="pencil" size={18} color={Colors.textSecondary} />
                </Pressable>
                {profile.type === 'parent' && profiles.filter(p => p.type === 'parent').length > 1 && (
                  <Pressable onPress={() => handleRemoveProfile(profile)} style={styles.profileActionButton}>
                    <Ionicons name="trash" size={18} color={Colors.error} />
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Daily Reminders</Text>
        <Text style={styles.sectionDescription}>
          Get optional notifications to help you stay on track with your habits.
        </Text>

        {/* Mid-day Reminder */}
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: "#F59E0B20" }]}>
                <Ionicons name="sunny-outline" size={22} color="#F59E0B" />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Mid-day Reminder</Text>
                <Text style={styles.settingDescription}>Prompt to log habits at midday</Text>
              </View>
            </View>
            <Switch
              value={settings.middayEnabled}
              onValueChange={toggleMidday}
              trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
              thumbColor={settings.middayEnabled ? Colors.primary : Colors.textLight}
            />
          </View>
          {settings.middayEnabled && (
            <Pressable
              style={styles.timeRow}
              onPress={() => openTimePicker('midday')}
            >
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
              <Text style={styles.timeText}>{formatTimeDisplay(settings.middayTime)}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </Pressable>
          )}
        </View>

        {/* Night Reminder */}
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: "#8B5CF620" }]}>
                <Ionicons name="moon-outline" size={22} color="#8B5CF6" />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Night Reminder</Text>
                <Text style={styles.settingDescription}>Final prompt before end of day</Text>
              </View>
            </View>
            <Switch
              value={settings.nightEnabled}
              onValueChange={toggleNight}
              trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
              thumbColor={settings.nightEnabled ? Colors.primary : Colors.textLight}
            />
          </View>
          {settings.nightEnabled && (
            <Pressable
              style={styles.timeRow}
              onPress={() => openTimePicker('night')}
            >
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
              <Text style={styles.timeText}>{formatTimeDisplay(settings.nightTime)}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </Pressable>
          )}
         </View>

        {/* Admin Values Section */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Admin Values</Text>
        <Text style={styles.sectionDescription}>
          Configure default values for bonus and penalty buttons. Maximum is 10,000 points.
        </Text>

        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: "#10B98120" }]}>
                <Ionicons name="add-circle-outline" size={22} color="#10B981" />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Bonus Amount</Text>
                <Text style={styles.settingDescription}>Default points for bonus button</Text>
              </View>
            </View>
            <TextInput
              style={styles.numberInput}
              value={settings.bonusAmount.toString()}
              keyboardType="numeric"
              onChangeText={(val) => {
                const num = parseInt(val || "0", 10);
                if (isNaN(num) || num < 0) {
                  return;
                }
                if (num > 10000) {
                  Alert.alert("Maximum Exceeded", "Bonus amount cannot exceed 10,000 points.");
                  return;
                }
                setSettings(s => ({ ...s, bonusAmount: num }));
              }}
              onBlur={() => saveReminderSettings(settings)}
            />
          </View>
          
          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: "#EF444420" }]}>
                <Ionicons name="remove-circle-outline" size={22} color="#EF4444" />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Penalty Amount</Text>
                <Text style={styles.settingDescription}>Default points for penalty button</Text>
              </View>
            </View>
            <TextInput
              style={styles.numberInput}
              value={settings.penaltyAmount.toString()}
              keyboardType="numeric"
              onChangeText={(val) => {
                const num = parseInt(val || "0", 10);
                if (isNaN(num) || num < 0) {
                  return;
                }
                if (num > 10000) {
                  Alert.alert("Maximum Exceeded", "Penalty amount cannot exceed 10,000 points.");
                  return;
                }
                setSettings(s => ({ ...s, penaltyAmount: num }));
              }}
              onBlur={() => saveReminderSettings(settings)}
            />
          </View>
        </View>

        {/* App Icon Section */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>App Icon</Text>
        <Text style={styles.sectionDescription}>
          Choose a custom icon for your home screen.
        </Text>

        <View style={styles.iconGrid}>
          {APP_ICONS.map((icon) => (
            <Pressable
              key={icon.id}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const success = await setAppIcon(icon.id);
                if (success) {
                  setSelectedIconId(icon.id);
                  if (Platform.OS !== 'web') {
                    Alert.alert(
                      "Icon Updated",
                      "The new icon will appear on your next app launch.",
                      [{ text: "OK" }]
                    );
                  }
                }
              }}
              style={[
                styles.iconOption,
                selectedIconId === icon.id && styles.iconOptionSelected,
              ]}
            >
              <View style={[
                styles.iconPreview,
                { backgroundColor: icon.id === 'primary' ? Colors.primary : icon.id === 'icon_dark' ? '#1E293B' : '#F59E0B' },
              ]}>
                <Ionicons
                  name={icon.id === 'primary' ? 'shield' : icon.id === 'icon_dark' ? 'moon' : 'trophy'}
                  size={32}
                  color="#fff"
                />
              </View>
              <Text style={styles.iconName}>{icon.name}</Text>
              {selectedIconId === icon.id && (
                <View style={styles.iconCheckmark}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTimePicker(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingField === 'midday' ? 'Mid-day Time' : 'Night Time'}
              </Text>
              <Pressable onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.wheelPickerContainer}>
              <View style={styles.wheelPickerRow}>
                <View style={styles.wheelPicker}>
                  <ScrollView
                    ref={hoursScrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={44}
                    decelerationRate="fast"
                    contentContainerStyle={styles.wheelScrollContent}
                    onMomentumScrollEnd={(e) => {
                      const offset = e.nativeEvent.contentOffset.y;
                      const hour = Math.round((offset - 88) / 44) + 1;
                      if (hour >= 1 && hour <= 12) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setWheelHours(hour);
                      }
                    }}
                  >
                    {hourOptions.map((hour) => (
                      <Pressable
                        key={hour}
                        style={[
                          styles.wheelItem,
                          wheelHours === hour && styles.wheelItemSelected,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWheelHours(hour);
                        }}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            wheelHours === hour && styles.wheelItemTextSelected,
                          ]}
                        >
                          {hour}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.wheelLabel}>Hour</Text>
                </View>

                <View style={styles.wheelPicker}>
                  <ScrollView
                    ref={minutesScrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={44}
                    decelerationRate="fast"
                    contentContainerStyle={styles.wheelScrollContent}
                    onMomentumScrollEnd={(e) => {
                      const offset = e.nativeEvent.contentOffset.y;
                      const minute = Math.round((offset - 88) / 44);
                      if (minute >= 0 && minute < 60) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setWheelMinutes(minute);
                      }
                    }}
                  >
                    {minuteOptions.map((minute) => (
                      <Pressable
                        key={minute}
                        style={[
                          styles.wheelItem,
                          wheelMinutes === minute && styles.wheelItemSelected,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWheelMinutes(minute);
                        }}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            wheelMinutes === minute && styles.wheelItemTextSelected,
                          ]}
                        >
                          {minute.toString().padStart(2, '0')}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.wheelLabel}>Min</Text>
                </View>

                <View style={styles.wheelPicker}>
                  <ScrollView
                    ref={periodScrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={44}
                    decelerationRate="fast"
                    contentContainerStyle={styles.wheelScrollContent}
                    onMomentumScrollEnd={(e) => {
                      const offset = e.nativeEvent.contentOffset.y;
                      const period = Math.round((offset - 88) / 44) === 0 ? 'AM' : 'PM';
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setWheelPeriod(period);
                    }}
                  >
                    {periodOptions.map((period) => (
                      <Pressable
                        key={period}
                        style={[
                          styles.wheelItem,
                          wheelPeriod === period && styles.wheelItemSelected,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setWheelPeriod(period);
                        }}
                      >
                        <Text
                          style={[
                            styles.wheelItemText,
                            wheelPeriod === period && styles.wheelItemTextSelected,
                          ]}
                        >
                          {period}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.wheelLabel}>Period</Text>
                </View>
              </View>

              <Pressable
                style={styles.wheelConfirmButton}
                onPress={handleSetTime}
              >
                <Text style={styles.wheelConfirmText}>Set Time</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Rename Profile Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View style={styles.inputModalOverlay}>
          <View style={styles.inputModalContent}>
            <Text style={styles.inputModalTitle}>Rename Profile</Text>
            <TextInput
              style={styles.inputModalInput}
              value={inputValue}
              onChangeText={setInputValue}
              autoFocus
              placeholder="Enter profile name"
            />
            <View style={styles.inputModalButtons}>
              <Pressable
                style={[styles.inputModalButton, styles.inputModalButtonCancel]}
                onPress={() => setShowRenameModal(false)}
              >
                <Text style={styles.inputModalButtonCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.inputModalButton, styles.inputModalButtonConfirm]}
                onPress={handleSaveRename}
              >
                <Text style={styles.inputModalButtonConfirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Parent Modal */}
      <Modal
        visible={showAddParentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddParentModal(false)}
      >
        <View style={styles.inputModalOverlay}>
          <View style={styles.inputModalContent}>
            <Text style={styles.inputModalTitle}>Add Parent</Text>
            <TextInput
              style={styles.inputModalInput}
              value={inputValue}
              onChangeText={setInputValue}
              autoFocus
              placeholder="Enter parent name"
            />
            <View style={styles.inputModalButtons}>
              <Pressable
                style={[styles.inputModalButton, styles.inputModalButtonCancel]}
                onPress={() => setShowAddParentModal(false)}
              >
                <Text style={styles.inputModalButtonCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.inputModalButton, styles.inputModalButtonConfirm]}
                onPress={handleSaveAddParent}
              >
                <Text style={styles.inputModalButtonConfirmText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Child Modal */}
      <Modal
        visible={showAddChildModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddChildModal(false)}
      >
        <View style={styles.inputModalOverlay}>
          <View style={styles.inputModalContent}>
            <Text style={styles.inputModalTitle}>Add Child</Text>
            <TextInput
              style={styles.inputModalInput}
              value={inputValue}
              onChangeText={setInputValue}
              autoFocus
              placeholder="Enter child name"
            />
            <View style={styles.inputModalButtons}>
              <Pressable
                style={[styles.inputModalButton, styles.inputModalButtonCancel]}
                onPress={() => setShowAddChildModal(false)}
              >
                <Text style={styles.inputModalButtonCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.inputModalButton, styles.inputModalButtonConfirm]}
                onPress={handleSaveAddChild}
              >
                <Text style={styles.inputModalButtonConfirmText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  addParentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addParentText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
  profileButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addChildButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addChildText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
  profilesList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  profileActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  settingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  settingIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  settingDescription: {
    fontSize: 13,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginHorizontal: 16,
  },
  timeText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  wheelPickerContainer: {
    height: 300,
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  wheelPickerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelPicker: {
    flex: 1,
    height: 180,
    alignItems: 'center',
  },
  wheelScrollContent: {
    paddingVertical: 88,
  },
  wheelItem: {
    height: 44,
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  wheelItemSelected: {
    backgroundColor: Colors.primary + '15',
  },
  wheelItemText: {
    fontSize: 18,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  wheelItemTextSelected: {
    color: Colors.primary,
    fontFamily: "Nunito_700Bold",
  },
  wheelLabel: {
    fontSize: 11,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  wheelConfirmButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  wheelConfirmText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: '#fff',
  },
  numberInput: {
    width: 80,
    padding: 8,
    backgroundColor: Colors.background,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  // App Icon Grid
  iconGrid: {
    flexDirection: "row",
    gap: 12,
  },
  iconOption: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    position: "relative",
  },
  iconOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "08",
  },
  iconPreview: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconName: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  iconCheckmark: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  inputModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  inputModalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  inputModalTitle: {
    fontSize: 22,
    fontFamily: 'Nunito_800ExtraBold',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  inputModalInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: 'Nunito_500Medium',
    color: Colors.text,
    marginBottom: 20,
  },
  inputModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  inputModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  inputModalButtonCancel: {
    backgroundColor: Colors.border,
  },
  inputModalButtonConfirm: {
    backgroundColor: Colors.primary,
  },
  inputModalButtonCancelText: {
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    color: Colors.text,
  },
  inputModalButtonConfirmText: {
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    color: '#fff',
  },
});
