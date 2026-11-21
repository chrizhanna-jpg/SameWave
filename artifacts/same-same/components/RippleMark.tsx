import React from "react";
import Svg, { Path } from "react-native-svg";

import { colors } from "@/theme";

interface Props {
  size?: number;
  color?: string;
}

/**
 * Three concentric wiggly arcs — the Ripple-stage Match action (rippling water).
 * Distinct from `WaveMark` (horizontal logo ribbons).
 */
export function RippleMark({ size = 32, color = colors.waterMid }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Ripple">
      {/* Outer ripple */}
      <Path d="M4.5 16.5 C7 14.2 9.5 13.2 12 13.2 C14.5 13.2 17 14.2 19.5 16.5" {...stroke} opacity={0.55} />
      {/* Mid ripple */}
      <Path d="M6.2 13.2 C8.2 11.4 10 10.7 12 10.7 C14 10.7 15.8 11.4 17.8 13.2" {...stroke} opacity={0.8} />
      {/* Inner ripple */}
      <Path d="M8 10 C9.4 8.7 10.6 8.2 12 8.2 C13.4 8.2 14.6 8.7 16 10" {...stroke} />
    </Svg>
  );
}
