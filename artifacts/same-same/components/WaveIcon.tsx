import React from "react";
import Svg, { Path } from "react-native-svg";

type WaveIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: object;
};

export function WaveIcon({
  size = 24,
  color = "#000",
  strokeWidth = 2,
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
      <Path d="M2 13 C 5 13, 5 5, 12 5 C 19 5, 19 13, 22 13" />
      <Path d="M3 19 C 6 19, 6 15, 12 15 C 18 15, 18 19, 21 19" />
    </Svg>
  );
}

export default WaveIcon;
