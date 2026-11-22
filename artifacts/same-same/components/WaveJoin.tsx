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
  seamMidY,
  seamStrokePath,
  waveClipAbove,
  waveClipBelow,
} from "@/core/waveJoin";
import { colors, waveJoin } from "@/theme";

interface PhotoSide {
  uri: string | null;
  ownPhotoId?: string;
  accessibilityLabel?: string;
  /** Soft→sharp load (Wave reveal / Match candidate). */
  blurIn?: boolean;
  /** Static soft focus for this side only (overrides blurIn once set). */
  blurRadius?: number;
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
 * Two photographs meet on one shared logo curve. Clips and the stroke are
 * derived from the same path in screen space (pixel `top`, never `50%`), so
 * they stay aligned on every phone size — including tall 412×915 screens.
 */
export function WaveJoin({ width, height, top, bottom, blurRadius }: Props) {
  const reactId = useId().replace(/:/g, "");
  const band = joinBandHeight(width);
  const mid = seamMidY(height);
  const topBox = mid + band / 2;
  const bottomBox = mid + band / 2;
  const strokeTop = mid - band / 2;

  const above = useMemo(() => waveClipAbove(width, topBox, band), [width, topBox, band]);
  const below = useMemo(() => waveClipBelow(width, bottomBox, band), [width, bottomBox, band]);
  // Full-screen stroke path — identical curve the clips hug.
  const stroke = useMemo(() => seamStrokePath(width, height, band), [width, height, band]);

  if (width <= 0 || height <= 0) return null;

  // SVG clip can't animate blurIn / static blur — MaskedView + Photo does.
  const bottomNeedsPhoto = Boolean(
    blurRadius || bottom.blurRadius || bottom.blurIn || bottom.ownPhotoId || !bottom.uri,
  );
  const topNeedsPhoto = Boolean(
    blurRadius || top.blurRadius || top.blurIn || top.ownPhotoId || !top.uri,
  );

  return (
    <View style={[styles.root, { width, height, backgroundColor: colors.background }]} pointerEvents="box-none">
      <View style={[styles.bottomBox, { height: bottomBox }]}>
        {!bottomNeedsPhoto && bottom.uri ? (
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
              ownPhotoId={bottom.ownPhotoId}
              blurRadius={bottom.blurRadius ?? blurRadius}
              blurIn={bottom.blurRadius != null ? false : bottom.blurIn}
              style={styles.photo}
              accessibilityLabel={bottom.accessibilityLabel}
            />
          </MaskedClip>
        )}
      </View>

      <View style={[styles.topBox, { height: topBox }]}>
        {!topNeedsPhoto && top.uri ? (
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
              blurRadius={top.blurRadius ?? blurRadius}
              blurIn={top.blurRadius != null ? false : top.blurIn}
              style={styles.photo}
              accessibilityLabel={top.accessibilityLabel}
            />
          </MaskedClip>
        )}
      </View>

      {/* Stroke in the same screen coords as the shared seam path. */}
      <View style={[styles.strokeWrap, { top: strokeTop, height: band }]} pointerEvents="none">
        <Svg width={width} height={height} style={{ position: "absolute", top: -strokeTop, left: 0 }}>
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
        <View collapsable={false} style={{ width, height, backgroundColor: "transparent" }}>
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
  root: { overflow: "hidden" },
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
    zIndex: 3,
    overflow: "visible",
  },
});
