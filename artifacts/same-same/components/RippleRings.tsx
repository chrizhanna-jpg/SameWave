import React, { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { NATIVE_DRIVER, useReducedMotion } from "@/device/motion";
import { colors, motion } from "@/theme";

interface Props {
  /** Width the outermost ring grows to. */
  size: number;
  rings?: number;
  /** Time for one ring to spread, in milliseconds. */
  duration?: number;
  /** Keeps going until unmounted. Otherwise every ring spreads once. */
  loop?: boolean;
  color?: string;
  /** Called when a one-off set of rings has finished. */
  onDone?: () => void;
}

/**
 * Deeper blue than waterMid so rings read on the pale #E9F6FF canvas in daylight
 * without turning harsh. Call sites may still pass waterMid over photographs.
 */
const DEFAULT_RING_COLOR = "#2A6FA8";

/**
 * Rings spreading over still water. The box is `size` square and the rings
 * spread from its centre; the parent places it.
 */
export function RippleRings({
  size,
  rings = 3,
  duration = motion.ring,
  loop = true,
  color = DEFAULT_RING_COLOR,
  onDone,
}: Props) {
  const reduced = useReducedMotion();
  const values = useMemo(
    () => Array.from({ length: rings }, () => new Animated.Value(0)),
    [rings],
  );

  useEffect(() => {
    if (reduced) {
      values.forEach((value) => value.setValue(0.55));
      if (!loop) {
        const timer = setTimeout(() => onDone?.(), motion.reducedFade);
        return () => clearTimeout(timer);
      }
      return;
    }
    const gap = duration / rings;
    const spreads = values.map((value, index) => {
      value.setValue(0);
      const spread = Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      });
      return loop
        ? Animated.sequence([Animated.delay(index * gap), Animated.loop(spread)])
        : Animated.sequence([Animated.delay(index * gap * 0.6), spread]);
    });
    const all = Animated.parallel(spreads);
    all.start(({ finished }) => {
      if (finished && !loop) onDone?.();
    });
    return () => all.stop();
    // `onDone` is read when the rings finish; restarting them for a new callback would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, reduced, duration, rings, loop]);

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: color,
              // Peak ~0.82 so rings stay calm but readable in daylight on #E9F6FF.
              opacity: value.interpolate({
                inputRange: [0, 0.12, 0.55, 1],
                outputRange: [0, 0.82, 0.42, 0],
              }),
              transform: [
                { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", borderWidth: 2.5 },
});

/** Shared ink for splash / waiting / Match glyph so the language stays one. */
export const RIPPLE_RING_INK = DEFAULT_RING_COLOR;
