import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  ConnectionMapPreview,
  type ConnectionMapKind,
} from "@/components/ConnectionMapPreview";
import { SharePosterTopSection } from "@/components/SharePosterHeader";
import { ShareWatermark } from "@/components/ShareWatermark";
import type { GeoTier, TimeTier } from "@/utils/celebrations";
import {
  SHARE_COLORS,
  SHARE_POSTER_GRADIENT,
  shareAtlasCardLayout,
} from "@/utils/shareLayoutTokens";

type ConnectionAtlasShareCardProps = {
  kind: ConnectionMapKind;
  fromCode?: string | null;
  toCode?: string | null;
  myPhotoUri: string;
  theirPhotoUri: string;
  myCountryFlag?: string;
  theirCountryFlag?: string;
  themeTitle: string;
  themeEmoji: string;
  timeTier: TimeTier;
  geoTier: GeoTier;
  showWatermark?: boolean;
  width: number;
};

/** Square atlas map share poster (1080×1080 spec, scales to preview). */
export function ConnectionAtlasShareCard({
  kind,
  fromCode,
  toCode,
  myPhotoUri,
  theirPhotoUri,
  myCountryFlag,
  theirCountryFlag,
  themeTitle,
  themeEmoji,
  timeTier,
  geoTier,
  showWatermark = false,
  width,
}: ConnectionAtlasShareCardProps) {
  const L = shareAtlasCardLayout(width, { showWatermark });
  const isRipple = kind === "ripple";
  const accent = isRipple ? SHARE_COLORS.ripple : SHARE_COLORS.wave;
  const mapW = L.mapW;
  const mapH = L.mapH;

  return (
    <View
      collapsable={false}
      style={[
        styles.frame,
        {
          width: L.side,
          height: L.side,
          borderRadius: L.radiusOuter,
        },
      ]}
    >
      <LinearGradient
        colors={[...SHARE_POSTER_GRADIENT.colors]}
        locations={[...SHARE_POSTER_GRADIENT.locations]}
        start={SHARE_POSTER_GRADIENT.start}
        end={SHARE_POSTER_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.root, { padding: L.pad, gap: L.gapXs }]}>
        <SharePosterTopSection
          variant={kind}
          layout={L}
          accentColor={accent}
          themeTitle={themeTitle}
          themeEmoji={themeEmoji}
          timeTier={timeTier}
          geoTier={geoTier}
        />

        <View style={[styles.body, { gap: L.gapSm, marginTop: L.gapSm }]}>
          <View style={styles.mapSlot}>
            <ConnectionMapPreview
              kind={kind}
              fromCode={fromCode}
              toCode={toCode}
              width={mapW}
              height={mapH}
              captureSafe
              style={{
                borderRadius: L.mapRadius,
                borderWidth: L.chipBorder,
                borderColor: SHARE_COLORS.divider,
              }}
            />
          </View>

          <View style={[styles.thumbsRow, { gap: L.gapLg, minHeight: L.thumbRowH }]}>
            <View
              style={[
                styles.thumbWrap,
                {
                  width: L.thumbSize,
                  height: L.thumbSize,
                  borderRadius: L.radiusPhoto,
                  borderWidth: L.thumbBorder,
                },
              ]}
            >
              <Image
                source={{ uri: myPhotoUri }}
                style={[styles.thumb, { borderRadius: L.radiusPhoto - 2 }]}
                resizeMode="cover"
              />
              <Text
                style={[
                  styles.thumbFlag,
                  { fontSize: Math.round(L.thumbFlag * 0.85), bottom: -6, right: -6 },
                ]}
              >
                {myCountryFlag ?? "🌍"}
              </Text>
            </View>
            <View style={[styles.thumbDots, { gap: L.gapXs }]}>
              <View
                style={[
                  styles.dot,
                  {
                    width: L.dotSize,
                    height: L.dotSize,
                    borderRadius: L.dotSize / 2,
                  },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  {
                    width: L.dotSize,
                    height: L.dotSize,
                    borderRadius: L.dotSize / 2,
                  },
                ]}
              />
              <View
                style={[
                  styles.dot,
                  {
                    width: L.dotSize,
                    height: L.dotSize,
                    borderRadius: L.dotSize / 2,
                  },
                ]}
              />
            </View>
            <View
              style={[
                styles.thumbWrap,
                {
                  width: L.thumbSize,
                  height: L.thumbSize,
                  borderRadius: L.radiusPhoto,
                  borderWidth: L.thumbBorder,
                },
              ]}
            >
              <Image
                source={{ uri: theirPhotoUri }}
                style={[styles.thumb, { borderRadius: L.radiusPhoto - 2 }]}
                resizeMode="cover"
              />
              <Text
                style={[
                  styles.thumbFlag,
                  { fontSize: Math.round(L.thumbFlag * 0.85), bottom: -6, right: -6 },
                ]}
              >
                {theirCountryFlag ?? "🌍"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <ShareWatermark layout={L} compact={!showWatermark} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: SHARE_COLORS.divider,
    backgroundColor: SHARE_COLORS.navy,
  },
  root: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 0,
    overflow: "hidden",
  },
  mapSlot: {
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexShrink: 0,
    alignItems: "center",
  },
  thumbsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbWrap: {
    overflow: "visible",
    borderColor: SHARE_COLORS.photoBorder,
    backgroundColor: SHARE_COLORS.navyMid,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbFlag: {
    position: "absolute",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  thumbDots: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    backgroundColor: "rgba(232,244,248,0.6)",
  },
});
