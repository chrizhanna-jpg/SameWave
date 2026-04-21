import React, { useEffect, useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
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
  delay: number;
  maxOpacity: number;
};

function Sparkle({
  cx,
  cy,
  rx,
  ry,
  rotation,
  color,
  dur,
  delay,
  maxOpacity,
}: Omit<SparkleSpec, "key">) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: dur, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [dur, delay, t]);
  const animatedProps = useAnimatedProps(() => ({
    opacity: 0.04 + t.value * maxOpacity,
  }));
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
 * waves — the relaxing twinkle you see standing on a beach. Renders
 * absolutely-positioned streaks that softly fade in and out at different
 * rates so no two specks pulse together. Pointer-events disabled so it
 * never intercepts taps.
 */
export function OceanShimmer({
  count = 38,
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
      // Thin, wide ellipses read as wave-top light streaks rather than dots.
      const rx = 8 + rnd() * 22;
      const ry = 1 + rnd() * 1.6;
      const rotation = -18 + rnd() * 36;
      const dur = 1600 + rnd() * 2800;
      const delay = rnd() * 2400;
      const isHighlight = rnd() > 0.72;
      return {
        key: i,
        cx,
        cy,
        rx,
        ry,
        rotation,
        dur,
        delay,
        color: isHighlight ? highlight : tint,
        maxOpacity: isHighlight ? 0.5 : 0.32,
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
            delay={s.delay}
            maxOpacity={s.maxOpacity}
          />
        ))}
      </Svg>
    </View>
  );
}
