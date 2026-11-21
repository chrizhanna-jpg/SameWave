import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { colors } from "@/theme";

export type IconName =
  | "close"
  | "back"
  | "flip"
  | "photos"
  | "play"
  | "stop"
  | "mic"
  | "check"
  | "chevron"
  | "help"
  | "account"
  | "history"
  | "wave";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

/** The few line icons the app needs, drawn here so no icon font has to load. */
export function Icon({ name, size = 24, color = colors.textPrimary }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "close" && <Path d="M6 6l12 12M18 6L6 18" {...stroke} />}
      {name === "back" && <Path d="M15 5l-7 7 7 7" {...stroke} />}
      {name === "chevron" && <Path d="M9 5l7 7-7 7" {...stroke} />}
      {name === "check" && <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} />}
      {name === "flip" && (
        <>
          <Path d="M4 11a8 8 0 0 1 14-4.5L20 8" {...stroke} />
          <Path d="M20 4v4h-4" {...stroke} />
          <Path d="M20 13a8 8 0 0 1-14 4.5L4 16" {...stroke} />
          <Path d="M4 20v-4h4" {...stroke} />
        </>
      )}
      {name === "photos" && (
        <>
          <Rect x={3.5} y={5} width={17} height={14} rx={3} {...stroke} />
          <Circle cx={9} cy={10} r={1.6} {...stroke} />
          <Path d="M4.5 17l4.5-4 3.5 3 3-2.5 4 3.5" {...stroke} />
        </>
      )}
      {name === "play" && <Path d="M8 5.5v13l11-6.5z" {...stroke} fill={color} />}
      {name === "stop" && <Rect x={7} y={7} width={10} height={10} rx={2} {...stroke} fill={color} />}
      {name === "mic" && (
        <>
          <Rect x={9} y={3.5} width={6} height={11} rx={3} {...stroke} />
          <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" {...stroke} />
        </>
      )}
      {name === "help" && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.7.4-1.1.9-1.1 1.75V14" {...stroke} />
          <Circle cx={12} cy={17} r={0.9} fill={color} stroke="none" />
        </>
      )}
      {name === "account" && (
        <>
          <Circle cx={12} cy={9} r={3.5} {...stroke} />
          <Path d="M5.5 19.5c1.8-3.2 4-4.8 6.5-4.8s4.7 1.6 6.5 4.8" {...stroke} />
        </>
      )}
      {name === "history" && (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 7.5V12l3 2" {...stroke} />
        </>
      )}
      {name === "wave" && (
        /**
         * Overlapping logo ribbons — same control points as `logoWaveCurve`
         * in core/waveJoin.ts (taller crest left, trough, lower crest right),
         * mapped into 24×24. Two strokes read as the glyph’s layered waves.
         */
        <>
          <Path
            d="M2 15.38 C3.6 14.62 5.2 7.78 8.4 6.64 C10.4 6.64 11.6 13.1 13.6 16.9 C15.2 19.56 16.4 11.58 17.6 10.06 C19.2 8.54 20.8 13.86 22 15.76"
            stroke={color}
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.7}
          />
          <Path
            d="M2 13.18 C3.6 12.42 5.2 5.58 8.4 4.44 C10.4 4.44 11.6 10.9 13.6 14.7 C15.2 17.36 16.4 9.38 17.6 7.86 C19.2 6.34 20.8 11.66 22 13.56"
            stroke={color}
            strokeWidth={2.45}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}
    </Svg>
  );
}
