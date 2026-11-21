import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { logoWavePath } from "@/core/waveJoin";
import { waveJoin } from "@/theme";

interface Props {
  /** Full screen width in points. */
  width: number;
}

/**
 * The soft join between the two Wave photographs.
 *
 * The curve echoes the SameWave logo: a taller rounded crest on the left,
 * a shallow trough, a lower crest on the right, then a gentle taper —
 * not a straight sine wave.
 */
export function WaveJoin({ width }: Props) {
  const height = Math.max(36, Math.round(width * waveJoin.amplitude * 2.4));
  const path = useMemo(() => logoWavePath(width, height), [width, height]);
  if (width <= 0) return null;
  return (
    <View style={[styles.wrap, { height, marginTop: -height / 2 }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Path
          d={path}
          fill="none"
          stroke={waveJoin.shadow}
          strokeWidth={waveJoin.shadowWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.55}
        />
        <Path
          d={path}
          fill="none"
          stroke={waveJoin.stroke}
          strokeWidth={waveJoin.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}


const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    zIndex: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
