import * as Haptics from "expo-haptics";
import React from "react";
import {
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, "style"> {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  haptic?: boolean | "light" | "medium";
}

export function PressableScale({
  children,
  style,
  pressedScale = 0.96,
  haptic = false,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    scale.value = withSpring(pressedScale, { damping: 18, stiffness: 350 });
    if (haptic) {
      const intensity =
        haptic === "medium"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(intensity).catch(() => {});
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withSpring(1, { damping: 16, stiffness: 280 });
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
