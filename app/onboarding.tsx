import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Dimensions,
  FlatList,
  ViewToken,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "../constants/colors";
import { createProfile, setActiveProfileId } from "../lib/storage";
import { setOnboardingComplete, setActiveProfileId as saveActiveProfile, saveProfiles, getSavedProfiles } from "../lib/onboarding-storage";
import { getProfiles } from "../lib/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Onboarding step data
interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  backgroundColor: string;
  isNameInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  nameKey?: 'child' | 'parent' | 'parent2';
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "Welcome to Habit Kingdom! 🏰",
    description:
      "A fun app for kids to build awesome habits and earn rewards! Let's go on an adventure!",
    icon: "checkmark-circle",
    iconColor: Colors.success,
    backgroundColor: Colors.success + "15",
  },
  {
    id: 2,
    title: "Earn Kingdom Coins 💰",
    description:
      "Finish your daily tasks to collect coins! Brush teeth, read books, clean up - every habit earns you treasure!",
    icon: "trophy",
    iconColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  {
    id: 3,
    title: "Get Awesome Rewards 🎁",
    description:
      "Use your coins to unlock fun rewards! Screen time, treats, toys - pick what makes you happy!",
    icon: "gift",
    iconColor: "#8B5CF6",
    backgroundColor: "#8B5CF6" + "15",
  },
  {
    id: 4,
    title: "What's Your Name, Hero? ⭐",
    description:
      "Tell us your name so we can make this adventure yours!",
    icon: "happy",
    iconColor: Colors.primary,
    backgroundColor: Colors.primary + "15",
    isNameInput: true,
    inputLabel: "Kid's Name",
    inputPlaceholder: "e.g., Emma",
    nameKey: 'child',
  },
  {
    id: 5,
    title: "Add Mom or Dad (Optional) 👨‍👩‍👧",
    description:
      "You can add up to 2 parents to help track your habits. Skip if you want!",
    icon: "people",
    iconColor: Colors.primaryDark,
    backgroundColor: Colors.primaryDark + "15",
    isNameInput: true,
    inputLabel: "Parent 1 Name (optional)",
    inputPlaceholder: "e.g., Mom",
    nameKey: 'parent',
  },
  {
    id: 6,
    title: "Add Another Parent? (Optional) 👨‍👩‍👧‍👦",
    description:
      "Want to add another parent? Skip if not needed!",
    icon: "person-add",
    iconColor: Colors.primaryDark,
    backgroundColor: Colors.primaryDark + "15",
    isNameInput: true,
    inputLabel: "Parent 2 Name (optional)",
    inputPlaceholder: "e.g., Dad",
    nameKey: 'parent2',
  },
  {
    id: 7,
    title: "Let's Go, Champion! 🚀",
    description:
      "Your habit kingdom is ready! Start your adventure and become a Habit Hero!",
    icon: "rocket",
    iconColor: Colors.primaryDark,
    backgroundColor: Colors.primaryDark + "15",
  },
];

// Progress Dot Component
function ProgressDot({ active, index }: { active: boolean; index: number }) {
  const animatedWidth = useSharedValue(active ? 1 : 0);
  const animatedScale = useSharedValue(active ? 1.2 : 1);

  useEffect(() => {
    animatedWidth.value = withTiming(active ? 1 : 0, { duration: 300 });
    animatedScale.value = withSpring(active ? 1.2 : 1, { damping: 15 });
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: interpolate(animatedWidth.value, [0, 1], [8, 24], Extrapolation.CLAMP),
    transform: [{ scale: animatedScale.value }],
  }));

  return (
    <Animated.View style={[styles.dot, animatedStyle, active && styles.dotActive]} />
  );
}

// Onboarding Slide Component
function OnboardingSlide({
  step,
  isActive,
  names,
  setNames,
}: {
  step: OnboardingStep;
  isActive: boolean;
  names: { child: string; parent: string; parent2: string };
  setNames: React.Dispatch<React.SetStateAction<{ child: string; parent: string; parent2: string }>>;
}) {
  return (
    <View style={styles.slide}>
      <Animated.View
        entering={FadeIn.duration(400)}
        exiting={FadeOut.duration(200)}
        style={[
          styles.iconContainer,
          { backgroundColor: step.backgroundColor },
        ]}
      >
        <Ionicons
          name={step.icon as any}
          size={80}
          color={step.iconColor}
        />
      </Animated.View>
      
      <Animated.View
        entering={FadeIn.delay(100).duration(400)}
        exiting={FadeOut.duration(200)}
        style={styles.textContainer}
      >
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>
        
        {step.isNameInput && step.nameKey && (
          <View style={styles.nameInputContainer}>
            <Text style={styles.nameInputLabel}>{step.inputLabel}</Text>
            <TextInput
              style={styles.nameInput}
              placeholder={step.inputPlaceholder}
              placeholderTextColor={Colors.textLight}
              value={names[step.nameKey]}
              onChangeText={(text) => setNames(prev => ({ ...prev, [step.nameKey!]: text }))}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// Main Onboarding Screen
export default function OnboardingScreen({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [names, setNames] = useState({ child: '', parent: '', parent2: '' });
  const flatListRef = useRef<FlatList>(null);

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_STEPS.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      // Create profiles
      const childName = names.child.trim() || 'Kid';
      const parentName = names.parent.trim() || 'Parent 1';
      const parent2Name = names.parent2.trim();
      
      try {
        const childProfile = await createProfile(childName, 'child');
        const parentProfile = await createProfile(parentName, 'parent');
        
        // Set child as active profile by default
        setActiveProfileId(childProfile.id);
        await saveActiveProfile(childProfile.id);
        await saveProfiles([
          { id: childProfile.id, name: childProfile.name, type: childProfile.type },
          { id: parentProfile.id, name: parentProfile.name, type: parentProfile.type },
        ]);
        
        // Create second parent if provided
        if (parent2Name) {
          const parent2Profile = await createProfile(parent2Name, 'parent');
          const existingProfiles = await getSavedProfiles();
          await saveProfiles([
            ...existingProfiles,
            { id: parent2Profile.id, name: parent2Profile.name, type: parent2Profile.type },
          ]);
        }
        
        await setOnboardingComplete();
      } catch (error) {
        console.error('Error creating profiles:', error);
      }
      
      onComplete();
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onComplete();
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const isNameStep = ONBOARDING_STEPS[currentIndex]?.isNameInput;
  const isChildStep = ONBOARDING_STEPS[currentIndex]?.nameKey === 'child';
  const isParentStep = ONBOARDING_STEPS[currentIndex]?.nameKey === 'parent';
  const isParent2Step = ONBOARDING_STEPS[currentIndex]?.nameKey === 'parent2';
  // Child step requires name, parent steps are optional (can skip)
  const canProceed = !isNameStep || (isChildStep ? names.child.trim().length > 0 : true);

  const renderItem = ({ item, index }: { item: OnboardingStep; index: number }) => (
    <OnboardingSlide step={item} isActive={index === currentIndex} names={names} setNames={setNames} />
  );

  const getItemLayout = (_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  });

  const isLastStep = currentIndex === ONBOARDING_STEPS.length - 1;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Skip Button */}
        {!isLastStep && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.skipContainer}>
            <Pressable onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Slides */}
        <FlatList
          ref={flatListRef}
          data={ONBOARDING_STEPS}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          scrollEventThrottle={16}
          scrollEnabled={!isNameStep}
        />

        {/* Progress Indicators */}
        <View style={styles.progressContainer}>
          {ONBOARDING_STEPS.map((_, index) => (
            <ProgressDot key={index} active={index === currentIndex} index={index} />
          ))}
        </View>

        {/* Navigation Buttons */}
        <View
          style={[
            styles.buttonContainer,
            { paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Pressable
            onPress={handleNext}
            disabled={!canProceed}
            style={({ pressed }) => [
              styles.nextButton,
              pressed && styles.nextButtonPressed,
              !canProceed && styles.nextButtonDisabled,
            ]}
          >
            <Text style={[styles.nextButtonText, !canProceed && styles.nextButtonTextDisabled]}>
              {isLastStep ? "Get Started" : "Next"}
            </Text>
            {!isLastStep && (
              <Ionicons name="arrow-forward" size={20} color={canProceed ? "#fff" : Colors.textLight} />
            )}
            {isLastStep && (
              <Ionicons name="rocket" size={20} color={canProceed ? "#fff" : Colors.textLight} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipContainer: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
  },
  slide: {
    width: SCREEN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  textContainer: {
    alignItems: "center",
    width: "100%",
  },
  title: {
    fontSize: 28,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 36,
  },
  description: {
    fontSize: 16,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  nameInputContainer: {
    width: "100%",
    marginTop: 24,
  },
  nameInputLabel: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    fontSize: 18,
    fontFamily: "Nunito_500Medium",
    color: Colors.text,
    borderWidth: 2,
    borderColor: Colors.primary,
    textAlign: "center",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  nextButtonDisabled: {
    backgroundColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  nextButtonText: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  nextButtonTextDisabled: {
    color: Colors.textLight,
  },
});
