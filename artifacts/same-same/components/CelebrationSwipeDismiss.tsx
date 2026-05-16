import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Icon } from "@/components/Icon";

type DragHintProps = {
  dragY?: Animated.Value;
  style?: StyleProp<ViewStyle>;
};

/** iOS-style grab bar at the top of celebration overlays. */
export function CelebrationSwipeHandle({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[styles.handleWrap, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.handle} />
    </View>
  );
}

/** Bouncing chevrons + pill explaining swipe-to-dismiss. */
export function CelebrationSwipeDismissHint({ dragY, style }: DragHintProps) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);

  const chevronShift = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 7],
  });

  const chevronFade = bounce.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 1, 0.45],
  });

  const hintOpacity =
    dragY != null
      ? dragY.interpolate({
          inputRange: [-140, -50, 0, 50, 140],
          outputRange: [0.25, 0.65, 1, 0.65, 0.25],
          extrapolate: "clamp",
        })
      : 1;

  const hintDragFollow =
    dragY != null
      ? dragY.interpolate({
          inputRange: [-120, 0, 120],
          outputRange: [-16, 0, 16],
          extrapolate: "clamp",
        })
      : 0;

  return (
    <Animated.View
      style={[
        styles.hintWrap,
        style,
        {
          opacity: hintOpacity,
          transform: [{ translateY: hintDragFollow }],
        },
      ]}
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel="Swipe down or up to dismiss"
    >
      <View style={styles.hintPill}>
        <View style={styles.chevronStack}>
          <Animated.View
            style={{
              opacity: chevronFade,
              transform: [{ translateY: chevronShift }],
            }}
          >
            <Icon name="chevron-down" size={22} color="#001018" />
          </Animated.View>
          <Animated.View
            style={[
              styles.chevronSecond,
              {
                opacity: chevronFade,
                transform: [{ translateY: chevronShift }],
              },
            ]}
          >
            <Icon name="chevron-down" size={22} color="#001018" />
          </Animated.View>
        </View>
        <Text style={styles.hintTitle}>Swipe to dismiss</Text>
        <Text style={styles.hintSub}>down or up</Text>
      </View>
    </Animated.View>
  );
}

export function celebrationDragScale(dragY: Animated.Value) {
  return dragY.interpolate({
    inputRange: [-160, 0, 160],
    outputRange: [0.93, 1, 0.93],
    extrapolate: "clamp",
  });
}

const styles = StyleSheet.create({
  handleWrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0, 16, 24, 0.32)",
  },
  hintWrap: {
    marginTop: 14,
    alignItems: "center",
    alignSelf: "stretch",
  },
  hintPill: {
    alignSelf: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },
  chevronStack: {
    alignItems: "center",
    height: 28,
    marginBottom: 2,
  },
  chevronSecond: {
    marginTop: -14,
    opacity: 0.55,
  },
  hintTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#001018",
    letterSpacing: 0.2,
  },
  hintSub: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(0, 16, 24, 0.55)",
    letterSpacing: 0.3,
  },
});
