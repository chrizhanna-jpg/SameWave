import React, { useEffect, useId, useMemo } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Stop } from "react-native-svg";

import { RIPPLE_RING_INK } from "@/components/RippleRings";
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
export function RippleMark({
  size = 32,
  color = RIPPLE_RING_INK,
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
      // Staggered still frames so the mark still reads as spreading rings.
      values.forEach((value, index) => value.setValue(0.28 + index * 0.18));
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
            {/* Back (upper) arc fades; front (lower) arc holds ink for depth. */}
            <Stop offset="0" stopColor={color} stopOpacity="0.12" />
            <Stop offset="0.4" stopColor={color} stopOpacity="0.42" />
            <Stop offset="0.72" stopColor={color} stopOpacity="0.78" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {values.map((value, index) => {
          // Outer rings (higher index starts later) stay a touch fainter overall.
          const ringGain = 1 - index * 0.12;
          const strokeW = 2.55 - index * 0.3;
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
              opacity={value.interpolate({
                inputRange: [0, 0.12, 0.55, 1],
                outputRange: [0, 0.92 * ringGain, 0.45 * ringGain, 0],
              })}
            />
          );
        })}

        {/* Tiny splash / drop at the optical centre. */}
        <Ellipse
          cx={cx}
          cy={cy}
          rx={2.4}
          ry={2.4 * ELLIPSE_ASPECT}
          fill={color}
          opacity={0.95}
        />
        <Circle cx={cx} cy={cy - 2.6} r={1.2} fill={color} opacity={0.9} />
      </Svg>
    </View>
  );
}

/** @deprecated Prefer RIPPLE_RING_INK — kept so older imports keep compiling. */
export const rippleMarkDefaultColor = colors.waterMid;
