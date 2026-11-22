import React, { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { RIPPLE_RING_INK } from "@/components/RippleRings";
import { NATIVE_DRIVER, useReducedMotion } from "@/device/motion";
import { colors, motion } from "@/theme";

interface Props {
  size?: number;
  color?: string;
  /** When false, show a still pebble + rings (reduced-motion / tests). Default true. */
  animated?: boolean;
}

/**
 * Match "Offer a Ripple" glyph: a pebble and concentric circles spreading
 * outward — same language as `RippleRings`, sized for the frosted action well.
 */
export function RippleMark({
  size = 32,
  color = RIPPLE_RING_INK,
  animated = true,
}: Props) {
  const reduced = useReducedMotion();
  const rings = 3;
  const values = useMemo(
    () => Array.from({ length: rings }, () => new Animated.Value(0)),
    [],
  );

  useEffect(() => {
    if (!animated || reduced) {
      values.forEach((value, index) => value.setValue(0.35 + index * 0.18));
      return;
    }
    const duration = Math.max(1400, motion.ring * 0.75);
    const gap = duration / rings;
    const spreads = values.map((value, index) => {
      value.setValue(0);
      const spread = Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      });
      return Animated.sequence([Animated.delay(index * gap), Animated.loop(spread)]);
    });
    const all = Animated.parallel(spreads);
    all.start();
    return () => all.stop();
  }, [animated, reduced, values]);

  const stroke = Math.max(1.75, size * 0.055);
  const pebble = Math.max(3.5, size * 0.16);

  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityLabel="Ripple"
    >
      {values.map((value, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              opacity: value.interpolate({
                inputRange: [0, 0.14, 0.55, 1],
                outputRange: [0, 0.88, 0.4, 0],
              }),
              transform: [
                { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] }) },
              ],
            },
          ]}
        />
      ))}
      <View
        style={{
          width: pebble,
          height: pebble,
          borderRadius: pebble / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});

/** @deprecated Prefer RIPPLE_RING_INK — kept so older imports keep compiling. */
export const rippleMarkDefaultColor = colors.waterMid;
