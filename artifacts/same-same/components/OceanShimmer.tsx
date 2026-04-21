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
    const specs: SparkleSpec[] = [];

    // Real ocean shimmer doesn't scatter evenly — sunlight rides the
    // wave crests, so the bright specks line up into rough, broken
    // diagonals. We model that by laying down a handful of gently
    // curved "crests" across the screen and threading sparkles along
    // each one, with small perpendicular jitter so the lines feel
    // hand-drawn rather than ruled.
    const crestCount = 6;
    const perCrest = Math.max(4, Math.round(count / crestCount));
    // All crests share roughly the same tilt — like waves rolling in
    // from one direction — with a tiny per-crest variation.
    const baseAngleDeg = -14;

    for (let c = 0; c < crestCount; c++) {
      const angleDeg = baseAngleDeg + (rnd() - 0.5) * 10;
      const angle = (angleDeg * Math.PI) / 180;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      // Perpendicular axis — jitter direction.
      const perpX = -dirY;
      const perpY = dirX;

      // Anchor each crest somewhere on the screen and let the line
      // stretch ±diag in either direction so it crosses the viewport.
      const anchorX = rnd() * width;
      const anchorY = rnd() * height;
      const diag = Math.hypot(width, height) * 0.6;
      // Each crest gets its own gentle sine wobble — amplitude and
      // wavelength — so it reads as a wave rather than a straight line.
      const wobbleAmp = 6 + rnd() * 14;
      const wobbleFreq = 0.004 + rnd() * 0.006;
      const wobblePhase = rnd() * Math.PI * 2;

      for (let i = 0; i < perCrest; i++) {
        // Position along the crest, with slight random spacing so the
        // specks don't feel mechanically distributed.
        const tAlong = (i + rnd() * 0.7 - 0.35) / (perCrest - 1 || 1);
        const along = (tAlong - 0.5) * 2 * diag;
        const wobble =
          Math.sin(along * wobbleFreq + wobblePhase) * wobbleAmp;
        // Small extra perpendicular jitter so the crest line isn't
        // perfectly clean.
        const jitter = (rnd() - 0.5) * 8;
        const offset = wobble + jitter;
        const cx = anchorX + dirX * along + perpX * offset;
        const cy = anchorY + dirY * along + perpY * offset;
        if (cx < -40 || cx > width + 40 || cy < -40 || cy > height + 40) {
          continue;
        }

        const rx = 4 + rnd() * 11;
        const ry = 0.5 + rnd() * 0.9;
        // Streaks tilt with the crest they belong to — that's what
        // sells the "lined up on a wave" look.
        const rotation = angleDeg + (rnd() - 0.5) * 14;
        const dur = 2400 + rnd() * 3600;
        const phase = rnd();
        const drift = 2 + rnd() * 4;
        const isHighlight = rnd() > 0.78;
        specs.push({
          key: c * 1000 + i,
          cx,
          cy,
          rx,
          ry,
          rotation,
          dur,
          phase,
          drift,
          color: isHighlight ? highlight : tint,
          base: isHighlight ? 0.1 : 0.07,
          amp: isHighlight ? 0.22 : 0.13,
        });
      }
    }

    return specs;
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
