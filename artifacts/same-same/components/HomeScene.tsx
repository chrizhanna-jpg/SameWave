import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

import { colors } from "@/theme";

/**
 * Stylised calm lake-and-mountain illustration for the home screen only.
 * Vector shapes only (no photo, no boat). Every fill is an existing palette
 * colour at full strength or with opacity — no new hues.
 *
 * Palette used (from theme.ts, unchanged):
 *   background #E9F6FF, surface #DEF2FE, waterPale #C7E8FE,
 *   waterSoft #9ED4FC, waterMid #45B4FC, waterMuted #6E8099,
 *   white #FFFFFF, slate #3F4A4B (shadows only at low opacity).
 */
export function HomeScene() {
  const { width, height } = useWindowDimensions();
  const waterY = height * 0.52;

  const mountains = useMemo(() => {
    const w = width;
    const base = waterY;
    return {
      // Far ridge — softest
      far: `M0 ${base * 0.72} L${w * 0.18} ${base * 0.48} L${w * 0.34} ${base * 0.62} L${w * 0.52} ${base * 0.38} L${w * 0.7} ${base * 0.58} L${w * 0.88} ${base * 0.42} L${w} ${base * 0.55} L${w} ${base} L0 ${base} Z`,
      // Mid ridge
      mid: `M0 ${base * 0.82} L${w * 0.12} ${base * 0.58} L${w * 0.28} ${base * 0.72} L${w * 0.45} ${base * 0.5} L${w * 0.62} ${base * 0.68} L${w * 0.78} ${base * 0.54} L${w * 0.92} ${base * 0.7} L${w} ${base * 0.62} L${w} ${base} L0 ${base} Z`,
      // Near foothills
      near: `M0 ${base * 0.9} L${w * 0.22} ${base * 0.74} L${w * 0.4} ${base * 0.86} L${w * 0.58} ${base * 0.7} L${w * 0.76} ${base * 0.84} L${w} ${base * 0.76} L${w} ${base} L0 ${base} Z`,
    };
  }, [width, waterY]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.waterSoft} stopOpacity="0.55" />
            <Stop offset="0.45" stopColor={colors.background} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.waterPale} stopOpacity="0.9" />
          </LinearGradient>
          <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.waterPale} stopOpacity="0.95" />
            <Stop offset="0.55" stopColor={colors.waterSoft} stopOpacity="0.75" />
            <Stop offset="1" stopColor={colors.waterMid} stopOpacity="0.35" />
          </LinearGradient>
          <LinearGradient id="mountainFar" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.waterSoft} stopOpacity="0.45" />
            <Stop offset="1" stopColor={colors.waterPale} stopOpacity="0.7" />
          </LinearGradient>
          <LinearGradient id="mountainMid" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.waterMuted} stopOpacity="0.22" />
            <Stop offset="1" stopColor={colors.waterSoft} stopOpacity="0.55" />
          </LinearGradient>
          <LinearGradient id="mountainNear" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.waterMuted} stopOpacity="0.28" />
            <Stop offset="1" stopColor={colors.waterMid} stopOpacity="0.28" />
          </LinearGradient>
        </Defs>

        {/* Sky */}
        <Rect x={0} y={0} width={width} height={waterY} fill="url(#sky)" />

        {/* Soft cloud shapes — white / surface at low opacity */}
        <Ellipse
          cx={width * 0.18}
          cy={height * 0.12}
          rx={width * 0.16}
          ry={height * 0.028}
          fill={colors.white}
          opacity={0.42}
        />
        <Ellipse
          cx={width * 0.28}
          cy={height * 0.115}
          rx={width * 0.1}
          ry={height * 0.022}
          fill={colors.surface}
          opacity={0.55}
        />
        <Ellipse
          cx={width * 0.72}
          cy={height * 0.09}
          rx={width * 0.18}
          ry={height * 0.03}
          fill={colors.white}
          opacity={0.38}
        />
        <Ellipse
          cx={width * 0.82}
          cy={height * 0.085}
          rx={width * 0.09}
          ry={height * 0.02}
          fill={colors.surface}
          opacity={0.5}
        />
        <Ellipse
          cx={width * 0.48}
          cy={height * 0.16}
          rx={width * 0.14}
          ry={height * 0.02}
          fill={colors.white}
          opacity={0.28}
        />

        {/* Soft shadow under clouds — slate at very low opacity */}
        <Ellipse
          cx={width * 0.2}
          cy={height * 0.145}
          rx={width * 0.14}
          ry={height * 0.012}
          fill={colors.slate}
          opacity={0.04}
        />
        <Ellipse
          cx={width * 0.75}
          cy={height * 0.118}
          rx={width * 0.15}
          ry={height * 0.01}
          fill={colors.slate}
          opacity={0.035}
        />

        {/* Layered mountain silhouettes */}
        <Path d={mountains.far} fill="url(#mountainFar)" />
        <Path d={mountains.mid} fill="url(#mountainMid)" />
        {/* Soft depth shadow under the near ridge — slate at low opacity */}
        <Ellipse
          cx={width * 0.5}
          cy={waterY - 8}
          rx={width * 0.42}
          ry={18}
          fill={colors.slate}
          opacity={0.06}
        />
        <Path d={mountains.near} fill="url(#mountainNear)" />

        {/* Water body below the midline */}
        <Rect x={0} y={waterY} width={width} height={height - waterY} fill="url(#water)" />

        {/* Horizontal waterline */}
        <Rect
          x={0}
          y={waterY - 1.25}
          width={width}
          height={2.5}
          fill={colors.white}
          opacity={0.55}
        />
        <Rect
          x={0}
          y={waterY}
          width={width}
          height={1}
          fill={colors.waterMid}
          opacity={0.35}
        />

        {/* Gentle ripple lines in the water — no objects */}
        {[0.08, 0.16, 0.26, 0.38, 0.52].map((t, i) => {
          const y = waterY + (height - waterY) * t;
          const inset = width * (0.06 + i * 0.02);
          const amp = 4 + i * 1.5;
          const d = ripplePath(inset, y, width - inset * 2, amp, 3 + i);
          return (
            <Path
              key={`ripple-${i}`}
              d={d}
              stroke={i % 2 === 0 ? colors.white : colors.waterMid}
              strokeOpacity={i % 2 === 0 ? 0.35 : 0.22}
              strokeWidth={1.25}
              fill="none"
            />
          );
        })}

        {/* Soft bottom vignette — background at opacity for frosted cards */}
        <Rect
          x={0}
          y={height * 0.72}
          width={width}
          height={height * 0.28}
          fill={colors.background}
          opacity={0.35}
        />
      </Svg>
    </View>
  );
}

/** Soft sine-ish ripple as a cubic path across the water. */
function ripplePath(x: number, y: number, span: number, amp: number, waves: number): string {
  const steps = Math.max(8, waves * 4);
  let d = `M ${x} ${y}`;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const px = x + span * t;
    const py = y + Math.sin(t * Math.PI * waves) * amp * (1 - Math.abs(t - 0.5));
    const prevT = (i - 1) / steps;
    const c1x = x + span * (prevT + (t - prevT) / 3);
    const c2x = x + span * (prevT + (2 * (t - prevT)) / 3);
    const c1y = y + Math.sin(prevT * Math.PI * waves) * amp * (1 - Math.abs(prevT - 0.5));
    const c2y = py;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${px} ${py}`;
  }
  return d;
}
