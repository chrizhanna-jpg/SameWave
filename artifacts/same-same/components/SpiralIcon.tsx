import React from "react";
import Svg, { Path } from "react-native-svg";

type SpiralIconProps = {
  size?: number;
  color?: string;
  style?: object;
};

/** Dark blue groove (between-turn “field”). */
const SPIRAL_GROOVE = "#133370";
/** Light cyan coil on top. */
const SPIRAL_COIL = "#1FA9F0";

/** ~2.2 turns, ~3.5px between loops — stays readable at tab-bar size. */
const SPIRAL_PATH =
  "M12.23,10.53L12.45,10.51L12.68,10.52L12.92,10.57L13.15,10.65L13.38,10.78L13.61,10.93L13.81,11.13L14.00,11.36L14.15,11.63L14.27,11.93L14.35,12.25L14.38,12.59L14.35,12.95L14.27,13.30L14.13,13.65L13.93,13.98L13.68,14.28L13.38,14.55L13.04,14.78L12.66,14.97L12.25,15.10L11.82,15.17L11.37,15.18L10.92,15.13L10.46,15.02L10.02,14.84L9.59,14.60L9.19,14.30L8.82,13.93L8.51,13.51L8.25,13.04L8.05,12.52L7.93,11.97L7.89,11.40L7.93,10.82L8.07,10.24L8.28,9.68L8.59,9.14L8.97,8.65L9.42,8.21L9.94,7.83L10.51,7.52L11.13,7.29L11.79,7.15L12.46,7.09L13.15,7.13L13.84,7.26L14.52,7.49L15.17,7.81L15.78,8.22L16.33,8.73L16.82,9.31L17.22,9.97L17.54,10.69L17.75,11.46L17.85,12.26L17.83,13.07L17.69,13.89L17.44,14.69L17.07,15.45L16.60,16.16L16.02,16.80L15.36,17.37L14.61,17.84L13.80,18.22L12.94,18.48L12.04,18.63L11.12,18.65L10.19,18.54L9.27,18.31L8.38,17.95L7.54,17.46L6.77,16.85L6.08,16.13L5.49,15.32L5.01,14.41L4.67,13.44L4.47,12.43L4.41,11.38L4.50,10.33L4.74,9.28L5.13,8.28L5.66,7.33L6.31,6.45L7.09,5.67L7.97,4.99L8.95,4.43L10.00,4.00L11.11,3.72L12.26,3.60L13.43,3.63L14.60,3.82L15.74,4.18L16.83,4.70L17.85,5.37L18.77,6.18L19.58,7.13L20.24,8.19L20.76,9.34L21.11,10.56";

export function SpiralIcon({ size = 24, style }: SpiralIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <Path
        d={SPIRAL_PATH}
        fill="none"
        stroke={SPIRAL_GROOVE}
        strokeWidth={1.55}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      <Path
        d={SPIRAL_PATH}
        fill="none"
        stroke={SPIRAL_COIL}
        strokeWidth={0.72}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default SpiralIcon;
