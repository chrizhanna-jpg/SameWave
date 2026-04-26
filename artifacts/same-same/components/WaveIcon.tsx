import React from "react";
import Svg, { Path } from "react-native-svg";

type WaveIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: object;
};

// SameWave wave glyph — three stacked flowing wave-ribbons that echo
// the wave bands across the brand globe logo. Visually distinct from
// the `ripple` icon (lucide Waves), which is a tighter stack of small
// repeating squiggles. This one is a single long sine cycle per line
// for a calmer, more "flowing band" feel, suitable for small sizes.
export function WaveIcon({
  size = 24,
  color = "#000",
  strokeWidth = 1.8,
  style,
}: WaveIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style as never}
    >
      <Path d="M2 8 Q 7 4, 12 8 T 22 8" />
      <Path d="M2 12 Q 7 16, 12 12 T 22 12" />
      <Path d="M2 16 Q 7 12, 12 16 T 22 16" />
    </Svg>
  );
}

export default WaveIcon;
