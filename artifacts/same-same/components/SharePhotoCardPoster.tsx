import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { SharePosterTopSection } from "@/components/SharePosterHeader";
import { ShareWatermark } from "@/components/ShareWatermark";
import type { GeoTier, TimeTier } from "@/utils/celebrations";
import {
  SHARE_COLORS,
  SHARE_POSTER_GRADIENT,
  sharePhotoCardLayout,
  type SharePosterVariant,
} from "@/utils/shareLayoutTokens";

export type SharePhotoCardVariant = SharePosterVariant;

type SharePhotoCardPosterProps = {
  variant: SharePhotoCardVariant;
  side: number;
  themeTitle: string;
  themeEmoji: string;
  timeTier: TimeTier;
  geoTier: GeoTier;
  myPhotoUri: string;
  theirPhotoUri: string;
  myCountryFlag?: string;
  myCountryName: string;
  theirCountry: string;
  theirCountryFlag?: string;
  showWatermark: boolean;
  highlightBothCountries?: boolean;
  renderPhotoOverlay?: (slot: "mine" | "theirs") => React.ReactNode;
};

function PhotoTile({
  uri,
  flag,
  country,
  highlight,
  accent,
  layout,
  overlay,
}: {
  uri: string;
  flag: string;
  country: string;
  highlight?: boolean;
  accent: string;
  layout: ReturnType<typeof sharePhotoCardLayout>;
  overlay?: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.photoFrame,
        {
          width: layout.photoSize,
          height: layout.photoSize,
          borderRadius: layout.radiusPhoto,
          borderWidth: layout.photoBorder,
        },
      ]}
    >
      <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.82)"]}
        style={[styles.scrim, { height: layout.photoScrimH }]}
      />
      <View style={[styles.photoMeta, { padding: layout.gapSm }]}>
        <Text style={{ fontSize: layout.flagOnPhoto }}>{flag}</Text>
        <Text
          style={[
            styles.countryOnPhoto,
            {
              fontSize: highlight ? layout.countryOnPhotoHi : layout.countryOnPhoto,
              color: highlight ? accent : "#FFFFFF",
            },
          ]}
          numberOfLines={1}
        >
          {country}
        </Text>
      </View>
      {overlay ? <View style={styles.photoOverlay}>{overlay}</View> : null}
    </View>
  );
}

/**
 * Strict 1:1 photo share poster (1080×1080 export). Logo top-left, title
 * beside it, tidy chips, maximum-size photo pair with in-frame labels.
 */
export function SharePhotoCardPoster({
  variant,
  side,
  themeTitle,
  themeEmoji,
  timeTier,
  geoTier,
  myPhotoUri,
  theirPhotoUri,
  myCountryFlag,
  myCountryName,
  theirCountry,
  theirCountryFlag,
  showWatermark,
  highlightBothCountries = false,
  renderPhotoOverlay,
}: SharePhotoCardPosterProps) {
  const L = sharePhotoCardLayout(side, { showWatermark });
  const accent = variant === "ripple" ? SHARE_COLORS.ripple : SHARE_COLORS.wave;

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

      <View
        style={[
          styles.content,
          {
            padding: L.pad,
            gap: L.gapXs,
          },
        ]}
      >
        <SharePosterTopSection
          variant={variant}
          layout={L}
          accentColor={accent}
          themeTitle={themeTitle}
          themeEmoji={themeEmoji}
          timeTier={timeTier}
          geoTier={geoTier}
        />

        <View style={[styles.hero, { marginTop: L.gapSm }]}>
          <View
            style={[
              styles.photoRow,
              {
                gap: L.photoGap,
                maxHeight: L.photoSize,
              },
            ]}
          >
            <PhotoTile
              uri={myPhotoUri}
              flag={myCountryFlag ?? "🌍"}
              country={myCountryName}
              highlight={highlightBothCountries}
              accent={accent}
              layout={L}
              overlay={renderPhotoOverlay?.("mine")}
            />
            <PhotoTile
              uri={theirPhotoUri}
              flag={theirCountryFlag ?? "🌍"}
              country={theirCountry}
              highlight
              accent={accent}
              layout={L}
              overlay={renderPhotoOverlay?.("theirs")}
            />
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
  content: {
    flex: 1,
    minHeight: 0,
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 0,
    overflow: "hidden",
  },
  photoRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 1,
  },
  footer: {
    flexShrink: 0,
    alignItems: "center",
  },
  photoFrame: {
    overflow: "hidden",
    borderColor: SHARE_COLORS.photoBorder,
    backgroundColor: SHARE_COLORS.navyMid,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  photoMeta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  countryOnPhoto: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  photoOverlay: {
    position: "absolute",
    top: 6,
    left: 6,
  },
});
