import React, { useEffect, useId, useMemo } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Stop } from "react-native-svg";

import { useReducedMotion } from "@/device/motion";
import { colors, motion } from "@/theme";

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

interface Props {
  size?: number;
  color?: string;
  /** When false, show a still angled ripple (reduced-motion / tests). Default true. */
  animated?: boolean;
}

/** Vertical squash — water surface seen at roughly ~20°. */
const ELLIPSE_ASPECT = 0.32;
const RING_COUNT = 4;

/**
 * Match "Offer a Ripple" glyph: concentric ellipses in oblique view
 * (pebble dropped on water, seen at an angle). Front (lower) arcs are
 * thicker / more opaque; outer rings stay fainter.
 */
/** Match-disc ink — deep slate for ≥4.5:1 on SOFT_ICON_DISC_FILL over light/dark photos. */
export const MATCH_RIPPLE_INK = colors.slate;

export function RippleMark({
  size = 32,
  color = MATCH_RIPPLE_INK,
  animated = true,
}: Props) {
  const reduced = useReducedMotion();
  const gradId = `rippleDepth-${useId().replace(/:/g, "")}`;
  const values = useMemo(
    () => Array.from({ length: RING_COUNT }, () => new Animated.Value(0)),
    [],
  );

  useEffect(() => {
    if (!animated || reduced) {
      // Still frames around mid-large span (subtle fill, not edge-to-edge).
      values.forEach((value, index) => value.setValue(0.48 + index * 0.1));
      return;
    }
    const duration = Math.max(1600, motion.ring * 0.85);
    const gap = duration / RING_COUNT;
    const spreads = values.map((value, index) => {
      value.setValue(0);
      const spread = Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.quad),
        // SVG stroke attrs are not native-driver friendly.
        useNativeDriver: false,
      });
      return Animated.sequence([Animated.delay(index * gap), Animated.loop(spread)]);
    });
    const all = Animated.parallel(spreads);
    all.start();
    return () => all.stop();
  }, [animated, reduced, values]);

  const vb = 48;
  const cx = 24;
  // Optical centre of the squashed rings (not sunk toward the front arc).
  const cy = 24;
  // Outer ellipse ≈ 83% of the glyph; with size≈56 in a 64pt well that is ~73% of the button.
  const maxRx = 20;
  const minRx = 3.6;

  return (
    <View style={{ width: size, height: size }} accessibilityLabel="Ripple">
      <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            {/* Near-opaque throughout so rings stay readable on soft white discs. */}
            <Stop offset="0" stopColor={color} stopOpacity="0.55" />
            <Stop offset="0.4" stopColor={color} stopOpacity="0.82" />
            <Stop offset="0.72" stopColor={color} stopOpacity="0.95" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {values.map((value, index) => {
          // Outer rings (higher index starts later) stay a touch fainter overall.
          const ringGain = 1 - index * 0.1;
          // Thicker strokes so the glyph holds ≥4.5:1 on the translucent disc.
          const strokeW = 3.35 - index * 0.28;
          return (
            <AnimatedEllipse
              key={index}
              cx={cx}
              cy={cy}
              rx={value.interpolate({
                inputRange: [0, 1],
                outputRange: [minRx, maxRx],
              })}
              ry={value.interpolate({
                inputRange: [0, 1],
                outputRange: [minRx * ELLIPSE_ASPECT, maxRx * ELLIPSE_ASPECT],
              })}
              stroke={`url(#${gradId})`}
              strokeWidth={strokeW}
              fill="none"
              // Peak opacity once the ring is large (~55% of max), not at birth —
              // otherwise the glyph reads tiny even though maxRx is correct.
              opacity={value.interpolate({
                inputRange: [0, 0.2, 0.55, 0.85, 1],
                outputRange: [0, 0.45 * ringGain, 1 * ringGain, 0.55 * ringGain, 0],
              })}
            />
          );
        })}

        {/* Tiny splash / drop at the optical centre. */}
        <Ellipse
          cx={cx}
          cy={cy}
          rx={2.8}
          ry={2.8 * ELLIPSE_ASPECT}
          fill={color}
          opacity={1}
        />
        <Circle cx={cx} cy={cy - 2.8} r={1.35} fill={color} opacity={1} />
      </Svg>
    </View>
  );
}

/** @deprecated Prefer MATCH_RIPPLE_INK — kept so older imports keep compiling. */
export const rippleMarkDefaultColor = MATCH_RIPPLE_INK;
