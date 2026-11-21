import MaskedView from "@react-native-masked-view/masked-view";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Photo } from "@/components/Photo";
import {
  joinBandHeight,
  logoWavePath,
  waveClipAbove,
  waveClipBelow,
} from "@/core/waveJoin";
import { waveJoin } from "@/theme";

interface PhotoSide {
  uri: string | null;
  ownPhotoId?: string;
  accessibilityLabel?: string;
}

interface Props {
  /** Full screen width in points. */
  width: number;
  /** Full screen height in points. */
  height: number;
  /** Top photograph (yours). */
  top: PhotoSide;
  /** Bottom photograph (theirs). */
  bottom: PhotoSide;
  blurRadius?: number;
}

/**
 * The two Wave photographs meet along the logo ribbon: each photo is clipped
 * to the shared curve, and a thin warm-white stroke sits exactly on that seam.
 */
export function WaveJoin({ width, height, top, bottom, blurRadius }: Props) {
  const band = joinBandHeight(width);
  const half = height / 2;
  const topBox = half + band / 2;
  const bottomBox = half + band / 2;

  const above = useMemo(() => waveClipAbove(width, topBox, band), [width, topBox, band]);
  const below = useMemo(() => waveClipBelow(width, bottomBox, band), [width, bottomBox, band]);
  const stroke = useMemo(() => logoWavePath(width, band), [width, band]);

  if (width <= 0 || height <= 0) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={[styles.bottomBox, { height: bottomBox }]}>
        <MaskedView
          style={styles.fill}
          maskElement={
            <View style={styles.maskRoot}>
              <Svg width={width} height={bottomBox}>
                <Path d={below} fill="#FFFFFF" />
              </Svg>
            </View>
          }
        >
          <Photo
            uri={bottom.uri}
            blurRadius={blurRadius}
            style={styles.photo}
            accessibilityLabel={bottom.accessibilityLabel}
          />
        </MaskedView>
      </View>

      <View style={[styles.topBox, { height: topBox }]}>
        <MaskedView
          style={styles.fill}
          maskElement={
            <View style={styles.maskRoot}>
              <Svg width={width} height={topBox}>
                <Path d={above} fill="#FFFFFF" />
              </Svg>
            </View>
          }
        >
          <Photo
            uri={top.uri}
            ownPhotoId={top.ownPhotoId}
            blurRadius={blurRadius}
            style={styles.photo}
            accessibilityLabel={top.accessibilityLabel}
          />
        </MaskedView>
      </View>

      <View
        style={[styles.strokeWrap, { height: band, marginTop: -band / 2 }]}
        pointerEvents="none"
      >
        <Svg width={width} height={band}>
          <Path
            d={stroke}
            fill="none"
            stroke={waveJoin.shadow}
            strokeWidth={waveJoin.shadowWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.55}
          />
          <Path
            d={stroke}
            fill="none"
            stroke={waveJoin.stroke}
            strokeWidth={waveJoin.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  fill: { flex: 1 },
  photo: { width: "100%", height: "100%", borderRadius: 0 },
  maskRoot: { flex: 1, backgroundColor: "transparent" },
  topBox: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  bottomBox: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  strokeWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    zIndex: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
