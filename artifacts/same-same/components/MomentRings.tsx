import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type Mode = "burst" | "pulse" | "static";

type Props = {
  color: string;
  mode: Mode;
  /** Burst length. Ignored for pulse and static. */
  durationMs: number;
  onBurstEnd?: () => void;
};

/**
 * Concentric rings for the Ripple burst, the waiting pulse, and the
 * Wave reveal. `static` paints resting rings with no animation so the
 * card still reads when motion cannot run.
 */
export function MomentRings({ color, mode, durationMs, onBurstEnd }: Props) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const onBurstEndRef = useRef(onBurstEnd);
  onBurstEndRef.current = onBurstEnd;

  useEffect(() => {
    if (mode !== "burst") return;
    const span = Math.max(240, durationMs);
    const ring = (value: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: Math.round(span * 0.72),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
    const anim = Animated.parallel([
      ring(a, 0),
      ring(b, Math.round(span * 0.18)),
      ring(c, Math.round(span * 0.36)),
    ]);
    anim.start(({ finished }) => {
      if (finished) onBurstEndRef.current?.();
    });
    return () => anim.stop();
  }, [a, b, c, durationMs, mode]);

  useEffect(() => {
    if (mode !== "pulse") return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [mode, pulse]);

  const burstStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0.15, 0.85, 0],
    }),
    transform: [
      {
        scale: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1.85],
        }),
      },
    ],
  });

  const pulseStyle = {
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55, 0.12],
    }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.86, 1.22],
        }),
      },
    ],
  };

  return (
    <View style={styles.wrap} pointerEvents="none">
      {mode === "burst" ? (
        <>
          <Animated.View style={[styles.ring, { borderColor: color }, burstStyle(a)]} />
          <Animated.View style={[styles.ring, { borderColor: color }, burstStyle(b)]} />
          <Animated.View style={[styles.ring, { borderColor: color }, burstStyle(c)]} />
        </>
      ) : null}
      {mode === "pulse" ? (
        <>
          <Animated.View style={[styles.ring, { borderColor: color }, pulseStyle]} />
          <View style={[styles.ring, styles.rest, { borderColor: color }]} />
        </>
      ) : null}
      {mode === "static" ? (
        <>
          <View style={[styles.ring, styles.restOuter, { borderColor: color }]} />
          <View style={[styles.ring, styles.rest, { borderColor: color }]} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
  },
  rest: {
    opacity: 0.45,
    transform: [{ scale: 0.72 }],
  },
  restOuter: {
    opacity: 0.22,
    transform: [{ scale: 1.05 }],
  },
});
