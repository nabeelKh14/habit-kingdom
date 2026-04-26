import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "../constants/colors";
import { saveHabit, getHabits, updateHabit as updateHabitStorage, type Habit, getProfiles, type Profile } from "../lib/storage";
import { getActiveProfileId } from "../lib/onboarding-storage";
import { HABIT_ICONS, HABIT_COLORS } from "../lib/habitIcons";
import { scheduleHabitNotifications, cancelHabitNotifications } from "../lib/notifications";

type Frequency = 'once' | 'daily' | 'weekly' | 'monthly';

const DAYS_OF_WEEK = [
  { label: 'S', value: 0 },
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
];

const FREQUENCY_OPTIONS: { label: string; value: Frequency }[] = [
  { label: 'Once', value: 'once' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
];

export default function AddHabitScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const editHabitId = params.id as string | undefined;
  const isEditMode = !!editHabitId;
  
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(HABIT_ICONS[0].name);
  const [selectedColor, setSelectedColor] = useState(HABIT_COLORS[0]);
  const [coinReward, setCoinReward] = useState("10");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);

  // Load habit data for edit mode
  useEffect(() => {
    loadData();
  }, [editHabitId]);

  const loadData = async () => {
    try {
      const allProfiles = await getProfiles();
      setProfiles(allProfiles);
      const currentActiveProfileId = await getActiveProfileId();
      let initialProfileId = currentActiveProfileId || undefined;

      if (isEditMode) {
        const habits = await getHabits();
        const habit = habits.find(h => h.id === editHabitId);
        if (habit) {
          setName(habit.name);
          setSelectedIcon(habit.icon);
          setSelectedColor(habit.color);
          setCoinReward(habit.coinReward.toString());
          setFrequency(habit.frequency);
          if (habit.scheduledTime) setScheduledTime(habit.scheduledTime);
          if (habit.daysOfWeek) setDaysOfWeek(habit.daysOfWeek);
          if (habit.dayOfMonth) setDayOfMonth(habit.dayOfMonth);
          setNotificationsEnabled(habit.notificationsEnabled !== undefined ? habit.notificationsEnabled : true);
          if (habit.notificationTime) setNotificationTime(habit.notificationTime);
          if (habit.profileId && habit.profileId !== '') initialProfileId = habit.profileId;
        }
      }
      setSelectedProfileId(initialProfileId);
    } catch (error) {
      console.error('Error loading data for habit:', error);
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  // Recurrence state
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationTime, setNotificationTime] = useState("09:00");

  // Time picker modal
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNotificationTimePicker, setShowNotificationTimePicker] = useState(false);

  // Dual-mode time picker state
  const [timePickerMode, setTimePickerMode] = useState<'quick' | 'precision'>('precision');
  const [notificationTimePickerMode, setNotificationTimePickerMode] = useState<'quick' | 'precision'>('precision');
  
  // Wheel picker state
  const [wheelHours, setWheelHours] = useState(9);
  const [wheelMinutes, setWheelMinutes] = useState(0);
  const [wheelPeriod, setWheelPeriod] = useState<'AM' | 'PM'>('AM');
  const [notificationWheelHours, setNotificationWheelHours] = useState(9);
  const [notificationWheelMinutes, setNotificationWheelMinutes] = useState(0);
  const [notificationWheelPeriod, setNotificationWheelPeriod] = useState<'AM' | 'PM'>('AM');

  // Refs for wheel pickers
  const hoursScrollRef = useRef<ScrollView>(null);
  const minutesScrollRef = useRef<ScrollView>(null);
  const periodScrollRef = useRef<ScrollView>(null);
  const notificationHoursScrollRef = useRef<ScrollView>(null);
  const notificationMinutesScrollRef = useRef<ScrollView>(null);
  const notificationPeriodScrollRef = useRef<ScrollView>(null);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    try {
      if (isEditMode) {
        // Update existing habit
        await updateHabitStorage({
          id: editHabitId,
          name: name.trim(),
          icon: selectedIcon,
          color: selectedColor,
          coinReward: parseInt(coinReward, 10) || 10,
          frequency,
          scheduledTime: frequency !== 'once' ? scheduledTime : undefined,
          daysOfWeek: frequency === 'weekly' ? daysOfWeek : undefined,
          dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
          notificationsEnabled: notificationsEnabled && frequency !== 'once',
          notificationTime: notificationsEnabled && frequency !== 'once' ? notificationTime : undefined,
          profileId: selectedProfileId,
        });
        
        // Update notifications
        const habits = await getHabits();
        const updatedHabit = habits.find(h => h.id === editHabitId);
        if (updatedHabit) {
          if (notificationsEnabled && frequency !== 'once') {
            await scheduleHabitNotifications(updatedHabit);
          } else {
            await cancelHabitNotifications(editHabitId);
          }
        }
      } else {
        // Create new habit
        const habitData = {
          name: name.trim(),
          icon: selectedIcon,
          color: selectedColor,
          coinReward: parseInt(coinReward, 10) || 10,
          frequency,
          scheduledTime: frequency !== 'once' ? scheduledTime : undefined,
          daysOfWeek: frequency === 'weekly' ? daysOfWeek : undefined,
          dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
          notificationsEnabled: notificationsEnabled && frequency !== 'once',
          notificationTime: notificationsEnabled && frequency !== 'once' ? notificationTime : undefined,
          profileId: selectedProfileId,
        };

        const newHabit = await saveHabit(habitData);
        
        // Schedule notifications if enabled for recurring habits
        if (notificationsEnabled && frequency !== 'once') {
          await scheduleHabitNotifications(newHabit);
        }
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      console.error('Error saving habit:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg('Failed to save habit. Please try again.');
      setSaving(false);
    }
  };

  const toggleDayOfWeek = (day: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (daysOfWeek.includes(day)) {
      setDaysOfWeek(daysOfWeek.filter(d => d !== day));
    } else {
      setDaysOfWeek([...daysOfWeek, day].sort());
    }
  };

  const handleTimeChange = (hours: number, minutes: number) => {
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    setScheduledTime(`${h}:${m}`);
    setShowTimePicker(false);
  };

  const handleNotificationTimeChange = (hours: number, minutes: number) => {
    const h = hours.toString().padStart(2, '0');
    const m = minutes.toString().padStart(2, '0');
    setNotificationTime(`${h}:${m}`);
    setShowNotificationTimePicker(false);
  };

  const parseTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return { hours: h || 9, minutes: m || 0 };
  };

  // Initialize wheel picker values from time string
  const initWheelFromTime = (timeStr: string) => {
    const { hours, minutes } = parseTime(timeStr);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    setWheelHours(displayHours);
    setWheelMinutes(minutes);
    setWheelPeriod(period);
  };

  const initNotificationWheelFromTime = (timeStr: string) => {
    const { hours, minutes } = parseTime(timeStr);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    setNotificationWheelHours(displayHours);
    setNotificationWheelMinutes(minutes);
    setNotificationWheelPeriod(period);
  };

  // Convert wheel values to 24-hour format
  const wheelTo24Hour = (hours: number, period: 'AM' | 'PM') => {
    if (period === 'AM') {
      return hours === 12 ? 0 : hours;
    } else {
      return hours === 12 ? 12 : hours + 12;
    }
  };

  const formatTimeDisplay = (timeStr: string) => {
    const { hours, minutes } = parseTime(timeStr);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const webTopPadding = Platform.OS === "web" ? 67 : 0;
  const canSave = name.trim().length > 0 && !saving;
  const showRecurrenceOptions = frequency !== 'once';
  const showDaysOfWeek = frequency === 'weekly';
  const showDayOfMonth = frequency === 'monthly';

  // Generate time options for picker
  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      timeOptions.push({ hours: h, minutes: m });
    }
  }

  // Generate precision time options (1-minute intervals) for wheel picker
  const precisionTimeOptions = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m++) {
      precisionTimeOptions.push({ hours: h, minutes: m });
    }
  }

  // Wheel picker display options (12-hour format)
  const hourOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);
  const periodOptions: ('AM' | 'PM')[] = ['AM', 'PM'];

  // Open time picker and initialize wheel
  const openTimePicker = () => {
    initWheelFromTime(scheduledTime);
    setTimePickerMode('precision');
    setShowTimePicker(true);
    const { hours, minutes } = parseTime(scheduledTime);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    scrollToWheelPosition(hoursScrollRef, minutesScrollRef, periodScrollRef, displayHours, minutes, period);
  };

  const openNotificationTimePicker = () => {
    initNotificationWheelFromTime(notificationTime);
    setNotificationTimePickerMode('precision');
    setShowNotificationTimePicker(true);
    const { hours, minutes } = parseTime(notificationTime);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    scrollToWheelPosition(notificationHoursScrollRef, notificationMinutesScrollRef, notificationPeriodScrollRef, displayHours, minutes, period);
  };

  // Scroll wheel pickers to initial position when switching to precision mode
  const scrollToWheelPosition = (
    hoursRef: React.RefObject<ScrollView | null>,
    minutesRef: React.RefObject<ScrollView | null>,
    periodRef: React.RefObject<ScrollView | null>,
    hours: number,
    minutes: number,
    period: 'AM' | 'PM'
  ) => {
    setTimeout(() => {
      hoursRef.current?.scrollTo({ y: (hours - 1) * 44, animated: false });
      minutesRef.current?.scrollTo({ y: minutes * 44, animated: false });
      periodRef.current?.scrollTo({ y: (period === 'AM' ? 0 : 1) * 44, animated: false });
    }, 100);
  };

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
          <Text style={styles.headerTitle}>{isEditMode ? 'Edit Habit' : 'New Habit'}</Text>
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
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: selectedProfileId === p.id ? "#fff" : (p.type === 'child' ? Colors.primary : '#6B7280'), opacity: selectedProfileId === p.id ? 1 : 0.7 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selectedProfileId === p.id ? Colors.primary : '#fff', position: 'absolute', top: 5, left: 7 }} />
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: selectedProfileId === p.id ? Colors.primary : '#fff', position: 'absolute', bottom: 5, left: 8 }} />
                  </View>
                  <Text style={[
                    styles.profileChipText,
                    selectedProfileId === p.id && { color: "#fff" }
                  ]}>{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

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
          <View style={styles.coinExplanation}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.coinExplanationText}>
              Earn coins by completing this habit every time. Spend them on rewards!
            </Text>
          </View>
          <View style={styles.rewardSelector}>
            {["10", "20", "50", "100", "150", "200"].map((val) => (
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

          <Text style={styles.label}>Frequency</Text>
          <View style={styles.frequencySelector}>
            {FREQUENCY_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFrequency(option.value);
                }}
                style={[
                  styles.frequencyOption,
                  frequency === option.value && {
                    backgroundColor: Colors.primary,
                    borderColor: Colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.frequencyOptionText,
                    frequency === option.value && { color: "#fff" },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Scheduled Time Picker - Only show for recurring habits */}
          {showRecurrenceOptions && (
            <>
              <Text style={styles.label}>Scheduled Time</Text>
              <Pressable
                style={styles.timePickerButton}
                onPress={openTimePicker}
              >
                <Ionicons name="time-outline" size={20} color={Colors.primary} />
                <Text style={styles.timePickerText}>
                  {formatTimeDisplay(scheduledTime)}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
              </Pressable>
            </>
          )}

          {/* Days of Week Selector - Only show for weekly */}
          {showDaysOfWeek && (
            <>
              <Text style={styles.label}>Repeat On</Text>
              <View style={styles.daysOfWeekSelector}>
                {DAYS_OF_WEEK.map((day) => (
                  <Pressable
                    key={day.value}
                    onPress={() => toggleDayOfWeek(day.value)}
                    style={[
                      styles.dayButton,
                      daysOfWeek.includes(day.value) && {
                        backgroundColor: Colors.primary,
                        borderColor: Colors.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayButtonText,
                        daysOfWeek.includes(day.value) && { color: "#fff" },
                      ]}
                    >
                      {day.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* Day of Month Selector - Only show for monthly */}
          {showDayOfMonth && (
            <>
              <Text style={styles.label}>Day of Month</Text>
              <View style={styles.dayOfMonthSelector}>
                <Pressable
                  onPress={() => {
                    if (dayOfMonth > 1) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDayOfMonth(dayOfMonth - 1);
                    }
                  }}
                  style={styles.dayOfMonthButton}
                >
                  <Ionicons name="remove" size={24} color={Colors.primary} />
                </Pressable>
                <View style={styles.dayOfMonthValue}>
                  <Text style={styles.dayOfMonthText}>{dayOfMonth}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (dayOfMonth < 31) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDayOfMonth(dayOfMonth + 1);
                    }
                  }}
                  style={styles.dayOfMonthButton}
                >
                  <Ionicons name="add" size={24} color={Colors.primary} />
                </Pressable>
              </View>
              <Text style={styles.dayOfMonthHint}>
                {dayOfMonth === 1 ? '1st' : dayOfMonth === 2 ? '2nd' : dayOfMonth === 3 ? '3rd' : `${dayOfMonth}th`} of each month
              </Text>
            </>
          )}

          {/* Notification Toggle - Only show for recurring habits */}
          {showRecurrenceOptions && (
            <>
              <Text style={styles.label}>Notifications</Text>
              <Pressable
                style={styles.notificationToggle}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNotificationsEnabled(!notificationsEnabled);
                }}
              >
                <View style={styles.notificationToggleLeft}>
                  <Ionicons 
                    name={notificationsEnabled ? "notifications" : "notifications-outline"} 
                    size={22} 
                    color={notificationsEnabled ? Colors.primary : Colors.textSecondary} 
                  />
                  <Text style={styles.notificationToggleText}>
                    Remind me
                  </Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={(value) => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNotificationsEnabled(value);
                  }}
                  trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
                  thumbColor={notificationsEnabled ? Colors.primary : Colors.textLight}
                />
              </Pressable>

              {/* Notification Time Picker */}
              {notificationsEnabled && (
                <>
                  <Text style={styles.label}>Reminder Time</Text>
                  <Pressable
                    style={styles.timePickerButton}
                    onPress={openNotificationTimePicker}
                  >
                    <Ionicons name="time-outline" size={20} color={Colors.primary} />
                    <Text style={styles.timePickerText}>
                      {formatTimeDisplay(notificationTime)}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                  </Pressable>
                </>
              )}
            </>
          )}

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
                {icon.library === "ionicons" ? (
                  <Ionicons
                    name={icon.name as any}
                    size={22}
                    color={
                      selectedIcon === icon.name
                        ? selectedColor
                        : Colors.textSecondary
                    }
                  />
                ) : (
                  <Feather
                    name={icon.name as any}
                    size={22}
                    color={
                      selectedIcon === icon.name
                        ? selectedColor
                        : Colors.textSecondary
                    }
                  />
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
                {HABIT_ICONS.find(i => i.name === selectedIcon)?.library === "ionicons" ? (
                  <Ionicons
                    name={selectedIcon as any}
                    size={22}
                    color={selectedColor}
                  />
                ) : (
                  <Feather
                    name={selectedIcon as any}
                    size={22}
                    color={selectedColor}
                  />
                )}
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {name || "Habit Name"}
                </Text>
                <View style={styles.previewMeta}>
                  <Ionicons name="diamond" size={12} color={Colors.accent} />
                  <Text style={styles.previewReward}>
                    +{coinReward || "5"} points
                  </Text>
                  {showRecurrenceOptions && (
                    <Text style={styles.previewFrequency} numberOfLines={1}>
                      {' • '}
                      {frequency === 'daily' && 'Daily'}
                      {frequency === 'weekly' && (daysOfWeek.length > 0 ? `Weekly on ${daysOfWeek.map(d => DAYS_OF_WEEK[d].label).join('')}` : 'Weekly')}
                      {frequency === 'monthly' && `Monthly on ${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}`}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.previewCheck}>
                <View style={styles.previewCheckInner} />
              </View>
            </View>
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
                <Text style={styles.modalTitle}>Select Time</Text>
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              {/* Mode Toggle */}
              <View style={styles.modeToggleContainer}>
                <Pressable
                  style={[
                    styles.modeButton,
                    timePickerMode === 'quick' && styles.modeButtonActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTimePickerMode('quick');
                  }}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      timePickerMode === 'quick' && styles.modeButtonTextActive,
                    ]}
                  >
                    Quick (15 min)
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeButton,
                    timePickerMode === 'precision' && styles.modeButtonActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    initWheelFromTime(scheduledTime);
                    setTimePickerMode('precision');
                    const { hours, minutes } = parseTime(scheduledTime);
                    const period = hours >= 12 ? 'PM' : 'AM';
                    const displayHours = hours % 12 || 12;
                    scrollToWheelPosition(hoursScrollRef, minutesScrollRef, periodScrollRef, displayHours, minutes, period);
                  }}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      timePickerMode === 'precision' && styles.modeButtonTextActive,
                    ]}
                  >
                    Precise (1 min)
                  </Text>
                </Pressable>
              </View>

              {timePickerMode === 'quick' ? (
                <ScrollView style={styles.timePickerScroll}>
                  <View style={styles.timePickerGrid}>
                    {timeOptions.map((time) => {
                      const timeStr = `${time.hours.toString().padStart(2, '0')}:${time.minutes.toString().padStart(2, '0')}`;
                      const isSelected = scheduledTime === timeStr;
                      return (
                        <Pressable
                          key={timeStr}
                          onPress={() => handleTimeChange(time.hours, time.minutes)}
                          style={[
                            styles.timeOption,
                            isSelected && {
                              backgroundColor: Colors.primary,
                              borderColor: Colors.primary,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.timeOptionText,
                              isSelected && { color: "#fff" },
                            ]}
                          >
                            {formatTimeDisplay(timeStr)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
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
                    onPress={() => {
                      const hours24 = wheelTo24Hour(wheelHours, wheelPeriod);
                      handleTimeChange(hours24, wheelMinutes);
                    }}
                  >
                    <Text style={styles.wheelConfirmText}>Set Time</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </Pressable>
        </Modal>

        {/* Notification Time Picker Modal */}
        <Modal
          visible={showNotificationTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowNotificationTimePicker(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowNotificationTimePicker(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Reminder Time</Text>
                <Pressable onPress={() => setShowNotificationTimePicker(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              {/* Mode Toggle */}
              <View style={styles.modeToggleContainer}>
                <Pressable
                  style={[
                    styles.modeButton,
                    notificationTimePickerMode === 'quick' && styles.modeButtonActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNotificationTimePickerMode('quick');
                  }}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      notificationTimePickerMode === 'quick' && styles.modeButtonTextActive,
                    ]}
                  >
                    Quick (15 min)
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeButton,
                    notificationTimePickerMode === 'precision' && styles.modeButtonActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    initNotificationWheelFromTime(notificationTime);
                    setNotificationTimePickerMode('precision');
                    const { hours, minutes } = parseTime(notificationTime);
                    const period = hours >= 12 ? 'PM' : 'AM';
                    const displayHours = hours % 12 || 12;
                    scrollToWheelPosition(notificationHoursScrollRef, notificationMinutesScrollRef, notificationPeriodScrollRef, displayHours, minutes, period);
                  }}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      notificationTimePickerMode === 'precision' && styles.modeButtonTextActive,
                    ]}
                  >
                    Precise (1 min)
                  </Text>
                </Pressable>
              </View>

              {notificationTimePickerMode === 'quick' ? (
                <ScrollView style={styles.timePickerScroll}>
                  <View style={styles.timePickerGrid}>
                    {timeOptions.map((time) => {
                      const timeStr = `${time.hours.toString().padStart(2, '0')}:${time.minutes.toString().padStart(2, '0')}`;
                      const isSelected = notificationTime === timeStr;
                      return (
                        <Pressable
                          key={timeStr}
                          onPress={() => handleNotificationTimeChange(time.hours, time.minutes)}
                          style={[
                            styles.timeOption,
                            isSelected && {
                              backgroundColor: Colors.primary,
                              borderColor: Colors.primary,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.timeOptionText,
                              isSelected && { color: "#fff" },
                            ]}
                          >
                            {formatTimeDisplay(timeStr)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <View style={styles.wheelPickerContainer}>
                  <View style={styles.wheelPickerRow}>
                    <View style={styles.wheelPicker}>
                      <ScrollView
                        ref={notificationHoursScrollRef}
                        showsVerticalScrollIndicator={false}
                        snapToInterval={44}
                        decelerationRate="fast"
                        contentContainerStyle={styles.wheelScrollContent}
                        onMomentumScrollEnd={(e) => {
                          const offset = e.nativeEvent.contentOffset.y;
                          const hour = Math.round((offset - 88) / 44) + 1;
                          if (hour >= 1 && hour <= 12) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setNotificationWheelHours(hour);
                          }
                        }}
                      >
                        {hourOptions.map((hour) => (
                          <Pressable
                            key={hour}
                            style={[
                              styles.wheelItem,
                              notificationWheelHours === hour && styles.wheelItemSelected,
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setNotificationWheelHours(hour);
                            }}
                          >
                            <Text
                              style={[
                                styles.wheelItemText,
                                notificationWheelHours === hour && styles.wheelItemTextSelected,
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
                        ref={notificationMinutesScrollRef}
                        showsVerticalScrollIndicator={false}
                        snapToInterval={44}
                        decelerationRate="fast"
                        contentContainerStyle={styles.wheelScrollContent}
                        onMomentumScrollEnd={(e) => {
                          const offset = e.nativeEvent.contentOffset.y;
                          const minute = Math.round((offset - 88) / 44);
                          if (minute >= 0 && minute < 60) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setNotificationWheelMinutes(minute);
                          }
                        }}
                      >
                        {minuteOptions.map((minute) => (
                          <Pressable
                            key={minute}
                            style={[
                              styles.wheelItem,
                              notificationWheelMinutes === minute && styles.wheelItemSelected,
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setNotificationWheelMinutes(minute);
                            }}
                          >
                            <Text
                              style={[
                                styles.wheelItemText,
                                notificationWheelMinutes === minute && styles.wheelItemTextSelected,
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
                        ref={notificationPeriodScrollRef}
                        showsVerticalScrollIndicator={false}
                        snapToInterval={44}
                        decelerationRate="fast"
                        contentContainerStyle={styles.wheelScrollContent}
                        onMomentumScrollEnd={(e) => {
                          const offset = e.nativeEvent.contentOffset.y;
                          const period = Math.round((offset - 88) / 44) === 0 ? 'AM' : 'PM';
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setNotificationWheelPeriod(period);
                        }}
                      >
                        {periodOptions.map((period) => (
                          <Pressable
                            key={period}
                            style={[
                              styles.wheelItem,
                              notificationWheelPeriod === period && styles.wheelItemSelected,
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setNotificationWheelPeriod(period);
                            }}
                          >
                            <Text
                              style={[
                                styles.wheelItemText,
                                notificationWheelPeriod === period && styles.wheelItemTextSelected,
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
                    onPress={() => {
                      const hours24 = wheelTo24Hour(notificationWheelHours, notificationWheelPeriod);
                      handleNotificationTimeChange(hours24, notificationWheelMinutes);
                    }}
                  >
                    <Text style={styles.wheelConfirmText}>Set Time</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </Pressable>
        </Modal>

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
  rewardSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  coinExplanation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  coinExplanationText: {
    fontSize: 13,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    flex: 1,
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
  frequencySelector: {
    flexDirection: "row",
    gap: 8,
  },
  frequencyOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
  },
  frequencyOptionText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  timePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timePickerText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Nunito_500Medium",
    color: Colors.text,
  },
  daysOfWeekSelector: {
    flexDirection: "row",
    gap: 8,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dayButtonText: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  dayOfMonthSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  dayOfMonthButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  dayOfMonthValue: {
    minWidth: 80,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  dayOfMonthText: {
    fontSize: 24,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  dayOfMonthHint: {
    fontSize: 12,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    marginTop: 8,
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
    minHeight: 72,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  previewInfo: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  previewName: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    flexShrink: 1,
  },
  previewMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  previewReward: {
    fontSize: 12,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  previewFrequency: {
    fontSize: 11,
    fontFamily: "Nunito_500Medium",
    color: Colors.textSecondary,
    flexShrink: 1,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
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
  timePickerScroll: {
    maxHeight: 400,
  },
  timePickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
    justifyContent: "center",
  },
  timeOption: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minWidth: "28%",
    flexGrow: 1,
    alignItems: "center",
  },
  timeOptionText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  notificationToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notificationToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notificationToggleText: {
    fontSize: 16,
    fontFamily: "Nunito_500Medium",
    color: Colors.text,
  },
  // Dual-mode time picker styles
  modeToggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  modeButtonText: {
    fontSize: 13,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.text,
  },
  modeButtonTextActive: {
    color: '#fff',
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
  profileSelector: {
    marginBottom: 8,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  profileChipText: {
    fontSize: 14,
    fontFamily: 'Nunito_600SemiBold',
    color: Colors.textSecondary,
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
