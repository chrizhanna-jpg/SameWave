import React from "react";
import Svg, { Path, G } from "react-native-svg";

type Props = {
  size?: number;
  color?: string;
};

const HEART_PATH =
  "M0 8 C-7 2 -8 -2 -5 -5 C-3 -7 -1 -6 0 -3 C1 -6 3 -7 5 -5 C8 -2 7 2 0 8 Z";

export function MirrorHeart({ size = 24, color = "#001018" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="-12 -10 24 22" fill="none">
      <G transform="translate(0 4) rotate(-26) scale(0.62) translate(0 -8)">
        <Path d={HEART_PATH} fill={color} />
      </G>
      <G transform="translate(0 4) rotate(26) scale(0.62) translate(0 -8)">
        <Path d={HEART_PATH} fill={color} />
      </G>
    </Svg>
  );
}

export default MirrorHeart;
