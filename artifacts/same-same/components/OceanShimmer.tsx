import React, { useEffect, useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Ellipse } from "react-native-svg";

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SparkleSpec = {
  key: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  color: string;
  dur: number;
  // Starting phase (0..1) so each sparkle is already mid-shimmer the
  // moment the screen mounts — no fade-in delay.
  phase: number;
  // How far this sparkle drifts horizontally over a full cycle, in px.
  drift: number;
  // Peak twinkle amplitude added to the base opacity.
  amp: number;
  // Always-on baseline so the field is visible from the first frame.
  base: number;
};

function Sparkle({
  cx,
  cy,
  rx,
  ry,
  rotation,
  color,
  dur,
  phase,
  drift,
  amp,
  base,
}: Omit<SparkleSpec, "key">) {
  // Continuous time in cycles. Starts at the sparkle's phase so it's
  // already partway through the twinkle when mounted.
  const t = useSharedValue(phase);
  useEffect(() => {
    // Linear ramp from `phase` → `phase + 1` repeatedly. Sin/cos in the
    // animated props derives the actual smooth twinkle + drift.
    t.value = withRepeat(
      withTiming(phase + 1, { duration: dur, easing: Easing.linear }),
      -1,
      false,
    );
  }, [dur, phase, t]);

  const animatedProps = useAnimatedProps(() => {
    const TAU = Math.PI * 2;
    // 0..1 sine wave for the brightness twinkle.
    const tw = 0.5 + 0.5 * Math.sin(t.value * TAU);
    // Slower, offset wave for the lateral drift so motion feels
    // independent of the brightness pulse.
    const dx = drift * Math.sin(t.value * TAU * 0.5 + phase * TAU);
    return {
      opacity: base + amp * tw,
      cx: cx + dx,
    };
  });

  return (
    <AnimatedEllipse
      animatedProps={animatedProps}
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill={color}
      transform={`rotate(${rotation} ${cx} ${cy})`}
    />
  );
}

type Props = {
  /** Number of shimmer streaks. Higher = denser shimmer, lower = calmer. */
  count?: number;
  /** Soft tinted streak colour (the cooler, water-toned highlights). */
  tint?: string;
  /** Pure highlight colour (the brightest specks of sun on the wave tops). */
  highlight?: string;
  /** Random seed — change to get a different sparkle distribution. */
  seed?: number;
};

/**
 * Background-only shimmer that mimics sunlight glittering on calm ocean
 * waves — fine specks that are already visible the instant the screen
 * mounts, then drift sideways and twinkle softly so the field reads as
 * living water rather than a static texture. Pointer-events disabled so
 * it never intercepts taps.
 */
export function OceanShimmer({
  count = 44,
  tint = "#7FE7DC",
  highlight = "#FFFFFF",
  seed = 7,
}: Props) {
  const { width, height } = Dimensions.get("window");
  const sparkles = useMemo<SparkleSpec[]>(() => {
    const rnd = mulberry32(seed);
    return Array.from({ length: count }).map((_, i) => {
      const cx = rnd() * width;
      const cy = rnd() * height;
      // Finer streaks — smaller and thinner than before so individual
      // specks barely register up close but blend into a glittering
      // surface across the whole screen.
      const rx = 4 + rnd() * 11;
      const ry = 0.5 + rnd() * 0.9;
      const rotation = -18 + rnd() * 36;
      // Slower cycles → calmer, more meditative shimmer.
      const dur = 2400 + rnd() * 3600;
      const phase = rnd();
      // 2–6 px lateral drift — visible but never agitating.
      const drift = 2 + rnd() * 4;
      const isHighlight = rnd() > 0.78;
      return {
        key: i,
        cx,
        cy,
        rx,
        ry,
        rotation,
        dur,
        phase,
        drift,
        color: isHighlight ? highlight : tint,
        // Subtle: never fully opaque, always a present-but-quiet baseline
        // so the field is there from mount and only modulates gently.
        base: isHighlight ? 0.1 : 0.07,
        amp: isHighlight ? 0.22 : 0.13,
      };
    });
  }, [count, width, height, tint, highlight, seed]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Svg width={width} height={height}>
        {sparkles.map((s) => (
          <Sparkle
            key={s.key}
            cx={s.cx}
            cy={s.cy}
            rx={s.rx}
            ry={s.ry}
            rotation={s.rotation}
            color={s.color}
            dur={s.dur}
            phase={s.phase}
            drift={s.drift}
            amp={s.amp}
            base={s.base}
          />
        ))}
      </Svg>
    </View>
  );
}
