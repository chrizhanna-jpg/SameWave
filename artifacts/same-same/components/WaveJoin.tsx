import MaskedViewImport from "@react-native-masked-view/masked-view";
import React, { useId, useMemo, type ComponentType } from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from "react-native-svg";

/** RN 0.88 typings disagree with the MaskedView package; cast keeps JSX valid. */
const MaskedView = MaskedViewImport as unknown as ComponentType<
  ViewProps & {
    style?: StyleProp<ViewStyle>;
    maskElement?: React.ReactElement;
  }
>;

import { Photo } from "@/components/Photo";
import {
  joinBandHeight,
  logoWavePath,
  waveClipAbove,
  waveClipBelow,
} from "@/core/waveJoin";
import { colors, waveJoin } from "@/theme";

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
 *
 * Prefer SVG `ClipPath` when we have a plain `uri` (works in Expo Go + web).
 * Fall back to MaskedView + `Photo` when we need signed headers / blur.
 */
export function WaveJoin({ width, height, top, bottom, blurRadius }: Props) {
  const reactId = useId().replace(/:/g, "");
  const band = joinBandHeight(width);
  const half = height / 2;
  const topBox = half + band / 2;
  const bottomBox = half + band / 2;

  const above = useMemo(() => waveClipAbove(width, topBox, band), [width, topBox, band]);
  const below = useMemo(() => waveClipBelow(width, bottomBox, band), [width, bottomBox, band]);
  const stroke = useMemo(() => logoWavePath(width, band), [width, band]);

  if (width <= 0 || height <= 0) return null;

  // Plain URIs: SVG ClipPath (reliable in Expo Go + web). Blur / signed own-photo: MaskedView.
  const useSvgClip = !blurRadius;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} pointerEvents="box-none">
      <View style={[styles.bottomBox, { height: bottomBox }]}>
        {useSvgClip && bottom.uri ? (
          <ClippedSvgPhoto
            uri={bottom.uri}
            width={width}
            height={bottomBox}
            clipPathId={`wave-below-${reactId}`}
            clipD={below}
            accessibilityLabel={bottom.accessibilityLabel}
          />
        ) : (
          <MaskedClip width={width} height={bottomBox} clipD={below}>
            <Photo
              uri={bottom.uri}
              blurRadius={blurRadius}
              style={styles.photo}
              accessibilityLabel={bottom.accessibilityLabel}
            />
          </MaskedClip>
        )}
      </View>

      <View style={[styles.topBox, { height: topBox }]}>
        {useSvgClip && top.uri ? (
          <ClippedSvgPhoto
            uri={top.uri}
            width={width}
            height={topBox}
            clipPathId={`wave-above-${reactId}`}
            clipD={above}
            accessibilityLabel={top.accessibilityLabel}
          />
        ) : (
          <MaskedClip width={width} height={topBox} clipD={above}>
            <Photo
              uri={top.uri}
              ownPhotoId={top.ownPhotoId}
              blurRadius={blurRadius}
              style={styles.photo}
              accessibilityLabel={top.accessibilityLabel}
            />
          </MaskedClip>
        )}
      </View>

      {/* Stroke sits on the shared curve — not a separate band beside the photos. */}
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

function ClippedSvgPhoto({
  uri,
  width,
  height,
  clipPathId,
  clipD,
  accessibilityLabel,
}: {
  uri: string;
  width: number;
  height: number;
  clipPathId: string;
  clipD: string;
  accessibilityLabel?: string;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      accessibilityLabel={accessibilityLabel}
    >
      <Defs>
        <ClipPath id={clipPathId}>
          <Path d={clipD} />
        </ClipPath>
      </Defs>
      <SvgImage
        href={{ uri }}
        x={0}
        y={0}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${clipPathId})`}
      />
    </Svg>
  );
}

/** MaskedView fallback: explicit pixel size + non-collapsible mask (Android). */
function MaskedClip({
  width,
  height,
  clipD,
  children,
}: {
  width: number;
  height: number;
  clipD: string;
  children: React.ReactNode;
}) {
  return (
    <MaskedView
      style={{ width, height }}
      maskElement={
        <View
          collapsable={false}
          style={{ width, height, backgroundColor: "transparent" }}
        >
          <Svg width={width} height={height}>
            <Path d={clipD} fill="#FFFFFF" />
          </Svg>
        </View>
      }
    >
      <View style={{ width, height }}>{children}</View>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill },
  photo: { width: "100%", height: "100%", borderRadius: 0 },
  topBox: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    overflow: "hidden",
  },
  bottomBox: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
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
