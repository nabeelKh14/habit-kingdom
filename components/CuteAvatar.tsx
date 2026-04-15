import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, Path, Ellipse, G, Line, Polygon } from "react-native-svg";
import Colors from "../constants/colors";

interface EquippedSkill {
  id: string;
  type: 'weapon' | 'armor' | 'ability' | 'accessory';
  icon: string;
}

interface CuteAvatarProps {
  level?: number;
  size?: number;
  equippedSkills?: EquippedSkill[];
  celebrateSkill?: string | null;
}

export default function CuteAvatar({ level = 1, size = 140, equippedSkills = [], celebrateSkill = null }: CuteAvatarProps) {
  const bounceY = useSharedValue(0);
  const eyeBlink = useSharedValue(1);
  const sparkleRotate = useSharedValue(0);
  const celebrateScale = useSharedValue(1);
  const celebrateRotate = useSharedValue(0);
  const celebrateShake = useSharedValue(0);

  useEffect(() => {
    if (celebrateSkill) {
      const animations: Record<string, () => void> = {
        wooden_sword: () => {
          celebrateScale.value = withSequence(
            withTiming(1.2, { duration: 300 }),
            withTiming(1, { duration: 300 })
          );
        },
        leather_armor: () => {
          celebrateScale.value = withSequence(
            withTiming(1.1, { duration: 200 }),
            withTiming(1, { duration: 200 }),
            withTiming(1.1, { duration: 200 }),
            withTiming(1, { duration: 200 })
          );
        },
        speed_boots: () => {
          celebrateShake.value = withSequence(
            withTiming(-10, { duration: 100 }),
            withTiming(10, { duration: 100 }),
            withTiming(-10, { duration: 100 }),
            withTiming(10, { duration: 100 }),
            withTiming(0, { duration: 100 })
          );
        },
        iron_sword: () => {
          celebrateRotate.value = withSequence(
            withTiming(360, { duration: 800, easing: Easing.out(Easing.cubic) })
          );
        },
        iron_shield: () => {
          celebrateScale.value = withSequence(
            withTiming(1.3, { duration: 200 }),
            withTiming(0.9, { duration: 200 }),
            withTiming(1.1, { duration: 200 }),
            withTiming(1, { duration: 200 })
          );
        },
        magic_ring: () => {
          sparkleRotate.value = withTiming(720, { duration: 1500 });
        },
        flame_sword: () => {
          celebrateScale.value = withSequence(
            withTiming(1.5, { duration: 400 }),
            withTiming(1, { duration: 400 })
          );
        },
        dragon_armor: () => {
          celebrateScale.value = withSequence(
            withTiming(0.8, { duration: 300 }),
            withTiming(1.2, { duration: 300 }),
            withTiming(1, { duration: 300 })
          );
        },
        winged_boots: () => {
          bounceY.value = withSequence(
            withTiming(-20, { duration: 200 }),
            withTiming(10, { duration: 200 }),
            withTiming(-15, { duration: 200 }),
            withTiming(5, { duration: 200 }),
            withTiming(0, { duration: 200 })
          );
        },
        thunder_hammer: () => {
          celebrateShake.value = withSequence(
            withTiming(-15, { duration: 80 }),
            withTiming(15, { duration: 80 }),
            withTiming(-15, { duration: 80 }),
            withTiming(15, { duration: 80 }),
            withTiming(-15, { duration: 80 }),
            withTiming(15, { duration: 80 }),
            withTiming(0, { duration: 80 })
          );
        },
        crystal_shield: () => {
          celebrateScale.value = withSequence(
            withTiming(1.4, { duration: 500 }),
            withTiming(1, { duration: 500 })
          );
        },
        legendary_blade: () => {
          celebrateRotate.value = withSequence(
            withTiming(1080, { duration: 2000, easing: Easing.out(Easing.cubic) })
          );
        },
        crown_of_heroes: () => {
          celebrateScale.value = withSequence(
            withTiming(1.6, { duration: 600 }),
            withTiming(1, { duration: 600 })
          );
          sparkleRotate.value = withTiming(1440, { duration: 3000 });
        }
      };

      const anim = animations[celebrateSkill];
      if (anim) anim();
    }
  }, [celebrateSkill]);

  useEffect(() => {
    // Floating bounce animation
    bounceY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(6, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Eye blink animation
    const blinkLoop = () => {
      eyeBlink.value = withSequence(
        withDelay(
          2000 + Math.random() * 3000,
          withTiming(0.1, { duration: 100 })
        ),
        withTiming(1, { duration: 100 })
      );
    };
    blinkLoop();
    const interval = setInterval(blinkLoop, 3500);

    // Sparkle rotation
    sparkleRotate.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );

    return () => clearInterval(interval);
  }, []);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  const eyeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: eyeBlink.value }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sparkleRotate.value}deg` }],
  }));

  const celebrateStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: celebrateScale.value },
      { rotate: `${celebrateRotate.value}deg` },
      { translateX: celebrateShake.value }
    ],
  }));

  const bodyColor = level >= 10 ? "#8B5CF6" : level >= 5 ? "#3B82F6" : Colors.primary;
  const accentColor = level >= 10 ? "#C4B5FD" : level >= 5 ? "#93C5FD" : "#6EE7B7";

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Sparkle ring */}
      <Animated.View style={[styles.sparkleRing, sparkleStyle, { width: size + 20, height: size + 20 }]}>
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i * 60) * (Math.PI / 180);
          const radius = (size + 20) / 2 - 4;
          return (
            <View
              key={i}
              style={[
                styles.sparkle,
                {
                  left: radius + Math.cos(angle) * radius - 3,
                  top: radius + Math.sin(angle) * radius - 3,
                  backgroundColor: accentColor,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      {/* Avatar body */}
      <Animated.View style={[bodyStyle, celebrateStyle]}>
        <Svg width={size} height={size} viewBox="0 0 140 140">
          {/* Shadow */}
          <Ellipse cx="70" cy="130" rx="40" ry="6" fill="rgba(0,0,0,0.08)" />

          {/* Body - cute round shape */}
          <Circle cx="70" cy="75" r="52" fill={bodyColor} />
          
          {/* Belly highlight */}
          <Ellipse cx="70" cy="85" rx="35" ry="30" fill={accentColor} opacity={0.3} />

          {/* Eyes - white part */}
          <Circle cx="55" cy="65" r="12" fill="#fff" />
          <Circle cx="85" cy="65" r="12" fill="#fff" />

          {/* Pupils - will be animated for blink */}
          <G>
            <Circle cx="57" cy="66" r="6" fill="#1E293B" />
            <Circle cx="87" cy="66" r="6" fill="#1E293B" />
            {/* Eye shine */}
            <Circle cx="59" cy="63" r="2.5" fill="#fff" />
            <Circle cx="89" cy="63" r="2.5" fill="#fff" />
          </G>

          {/* Blush */}
          <Ellipse cx="42" cy="80" rx="8" ry="5" fill="#FDA4AF" opacity={0.5} />
          <Ellipse cx="98" cy="80" rx="8" ry="5" fill="#FDA4AF" opacity={0.5} />

          {/* Smile */}
          <Path
            d="M 60 85 Q 70 95 80 85"
            stroke="#1E293B"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* Crown/hat based on level */}
          {level >= 5 && (
            <G>
              <Path
                d="M 50 35 L 55 20 L 62 30 L 70 12 L 78 30 L 85 20 L 90 35 Z"
                fill="#FBBF24"
                stroke="#F59E0B"
                strokeWidth="1.5"
              />
              <Circle cx="70" cy="22" r="3" fill="#EF4444" />
              <Circle cx="58" cy="28" r="2" fill="#3B82F6" />
              <Circle cx="82" cy="28" r="2" fill="#10B981" />
            </G>
          )}

          {/* Little ears */}
          <Circle cx="28" cy="55" r="10" fill={bodyColor} />
          <Circle cx="28" cy="55" r="6" fill={accentColor} opacity={0.4} />
          <Circle cx="112" cy="55" r="10" fill={bodyColor} />
          <Circle cx="112" cy="55" r="6" fill={accentColor} opacity={0.4} />

          {/* Arms */}
          <Path
            d="M 25 90 Q 15 85 20 100"
            stroke={bodyColor}
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 115 90 Q 125 85 120 100"
            stroke={bodyColor}
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />

          {/* Feet */}
          <Ellipse cx="55" cy="125" rx="12" ry="6" fill={bodyColor} />
          <Ellipse cx="85" cy="125" rx="12" ry="6" fill={bodyColor} />

          {/* Equipped Skills Rendering */}
          {equippedSkills.map((skill) => {
            if (skill.type === 'weapon') {
              // Weapon in right hand area
              const weaponColors: Record<string, { shaft: string; head: string }> = {
                wooden_sword: { shaft: '#92400E', head: '#D97706' },
                iron_sword: { shaft: '#6B7280', head: '#9CA3AF' },
                flame_sword: { shaft: '#92400E', head: '#EF4444' },
                thunder_hammer: { shaft: '#78350F', head: '#FBBF24' },
                legendary_blade: { shaft: '#7C3AED', head: '#FBBF24' },
              };
              const colors = weaponColors[skill.id] || { shaft: '#92400E', head: '#9CA3AF' };
              return (
                <G key={skill.id}>
                  {/* Sword handle */}
                  <Line x1="120" y1="95" x2="128" y2="75" stroke={colors.shaft} strokeWidth="3.5" strokeLinecap="round" />
                  {/* Sword guard */}
                  <Line x1="116" y1="98" x2="124" y2="96" stroke={colors.shaft} strokeWidth="3" strokeLinecap="round" />
                  {/* Sword blade */}
                  <Line x1="128" y1="75" x2="132" y2="60" stroke={colors.head} strokeWidth="2.5" strokeLinecap="round" />
                  {/* Blade tip */}
                  <Circle cx="132" cy="59" r="1.5" fill={colors.head} />
                  {skill.id === 'flame_sword' && (
                    <>
                      <Circle cx="130" cy="65" r="3" fill="#EF4444" opacity={0.6} />
                      <Circle cx="133" cy="62" r="2" fill="#FBBF24" opacity={0.7} />
                    </>
                  )}
                  {skill.id === 'thunder_hammer' && (
                    <Polygon points="130,60 134,68 128,66 132,74" fill="#FBBF24" opacity={0.8} />
                  )}
                  {skill.id === 'legendary_blade' && (
                    <>
                      <Circle cx="132" cy="59" r="4" fill="#FBBF24" opacity={0.3} />
                      <Circle cx="128" cy="68" r="2" fill="#C4B5FD" opacity={0.6} />
                    </>
                  )}
                </G>
              );
            }
            if (skill.type === 'armor') {
              // Armor on the body
              const armorColors: Record<string, string> = {
                leather_armor: '#92400E',
                iron_shield: '#9CA3AF',
                dragon_armor: '#7C3AED',
                crystal_shield: '#67E8F9',
              };
              const color = armorColors[skill.id] || '#9CA3AF';
              return (
                <G key={skill.id}>
                  {/* Chest plate */}
                  <Path
                    d="M 48 65 Q 50 55 70 52 Q 90 55 92 65 L 88 90 Q 70 95 52 90 Z"
                    fill={color}
                    opacity={0.35}
                  />
                  {/* Shield on left arm */}
                  {skill.id === 'iron_shield' || skill.id === 'crystal_shield' ? (
                    <G>
                      <Ellipse cx="20" cy="95" rx="10" ry="13" fill={color} opacity={0.7} />
                      <Ellipse cx="20" cy="95" rx="6" ry="9" fill={color} opacity={0.4} />
                      {skill.id === 'crystal_shield' && (
                        <Circle cx="20" cy="95" r="3" fill="#fff" opacity={0.5} />
                      )}
                    </G>
                  ) : null}
                </G>
              );
            }
            if (skill.type === 'accessory') {
              // Accessories - boots on feet, ring on hand, crown already handled by level
              const accessoryColor: Record<string, string> = {
                speed_boots: '#3B82F6',
                magic_ring: '#A855F7',
                winged_boots: '#F0ABFC',
                crown_of_heroes: '#FBBF24',
              };
              const color = accessoryColor[skill.id] || '#3B82F6';
              if (skill.id === 'speed_boots' || skill.id === 'winged_boots') {
                return (
                  <G key={skill.id}>
                    {/* Boots on feet */}
                    <Path d="M 43 120 L 43 130 Q 43 134 48 134 L 60 134 Q 63 134 63 131 L 63 125" fill={color} opacity={0.7} />
                    <Path d="M 77 120 L 77 130 Q 77 134 82 134 L 94 134 Q 97 134 97 131 L 97 125" fill={color} opacity={0.7} />
                    {skill.id === 'winged_boots' && (
                      <>
                        <Path d="M 43 122 Q 38 118 35 122" stroke={color} strokeWidth="1.5" fill="none" opacity={0.6} />
                        <Path d="M 97 122 Q 102 118 105 122" stroke={color} strokeWidth="1.5" fill="none" opacity={0.6} />
                      </>
                    )}
                  </G>
                );
              }
              if (skill.id === 'magic_ring') {
                return (
                  <G key={skill.id}>
                    <Circle cx="20" cy="100" r="4" fill="none" stroke={color} strokeWidth="2" opacity={0.8} />
                    <Circle cx="20" cy="100" r="1.5" fill="#FBBF24" opacity={0.7} />
                  </G>
                );
              }
              if (skill.id === 'crown_of_heroes') {
                return (
                  <G key={skill.id}>
                    <Path
                      d="M 50 30 L 54 18 L 60 26 L 70 10 L 80 26 L 86 18 L 90 30 Z"
                      fill={color}
                      stroke="#D97706"
                      strokeWidth="1"
                    />
                    <Circle cx="70" cy="20" r="3" fill="#EF4444" />
                    <Circle cx="58" cy="25" r="2" fill="#3B82F6" />
                    <Circle cx="82" cy="25" r="2" fill="#10B981" />
                  </G>
                );
              }
              return null;
            }
            return null;
          })}
        </Svg>
      </Animated.View>

      {/* Level badge */}
      {level >= 1 && (
        <View style={[styles.levelBadge, { backgroundColor: bodyColor }]}>
          <Animated.Text style={styles.levelText}>{level}</Animated.Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  sparkleRing: {
    position: "absolute",
    top: -10,
    left: -10,
  },
  sparkle: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  levelBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  levelText: {
    fontSize: 14,
    fontFamily: "Nunito_800ExtraBold",
    color: "#fff",
  },
});
