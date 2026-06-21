import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { ShareMetaChips, ShareThemeChip } from "@/components/MatchContextChips";
import { WaveIcon } from "@/components/WaveIcon";
import type { GeoTier, TimeTier } from "@/utils/celebrations";
import {
  SHARE_COLORS,
  type ShareLayoutTokens,
  type SharePosterVariant,
} from "@/utils/shareLayoutTokens";

type SharePosterHeaderProps = {
  variant: SharePosterVariant;
  layout: ShareLayoutTokens;
};

/** SameWave logo + Ripple / Wave title (no topic chip — use SharePosterTopSection). */
export function SharePosterHeader({ variant, layout }: SharePosterHeaderProps) {
  const isRipple = variant === "ripple";
  const accent = isRipple ? SHARE_COLORS.ripple : SHARE_COLORS.wave;
  const label = isRipple ? "Ripple" : "Wave";
  const glyphName = isRipple ? "ripple" : "wave-glyph";

  return (
    <View
      style={[
        styles.brandCluster,
        {
          gap: layout.gapSm,
          minHeight: layout.logoRendered,
          flex: 1,
          minWidth: 0,
        },
      ]}
    >
      <View
        style={[
          styles.logoSlot,
          {
            width: layout.logoRendered,
            height: layout.logoRendered,
          },
        ]}
      >
        <WaveIcon size={layout.logoMark} />
      </View>
      <View style={[styles.titleRow, { gap: layout.gapXs }]}>
        <Icon name={glyphName} size={layout.titleGlyph} color={accent} />
        <Text
          style={[
            styles.title,
            {
              fontSize: layout.titleSize,
              letterSpacing: layout.titleTracking,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

/** Hairline between meta chips and hero (map / photos). */
export function SharePosterDivider({ layout }: { layout: ShareLayoutTokens }) {
  return (
    <View
      style={[
        styles.divider,
        {
          height: layout.dividerH,
        },
      ]}
    />
  );
}

type SharePosterTopSectionProps = {
  variant: SharePosterVariant;
  layout: ShareLayoutTokens;
  accentColor: string;
  themeTitle: string;
  themeEmoji: string;
  timeTier: TimeTier;
  geoTier: GeoTier;
};

/**
 * Mockup layout: [logo + title | topic chip] → divider → meta chips → hero.
 */
export function SharePosterTopSection({
  variant,
  layout,
  accentColor,
  themeTitle,
  themeEmoji,
  timeTier,
  geoTier,
}: SharePosterTopSectionProps) {
  const headerH = Math.max(
    layout.logoRendered,
    layout.chipThemeMinH,
    Math.round(layout.titleSize * 1.12),
  );

  return (
    <View
      style={[
        topStyles.wrap,
        { gap: layout.gapXs, maxWidth: layout.inner },
      ]}
    >
      <View
        style={[
          topStyles.headerRow,
          {
            gap: layout.gapSm,
            minHeight: headerH,
          },
        ]}
      >
        <SharePosterHeader variant={variant} layout={layout} />
        <ShareThemeChip
          layout={layout}
          accentColor={accentColor}
          themeTitle={themeTitle}
          themeEmoji={themeEmoji}
        />
      </View>

      <SharePosterDivider layout={layout} />

      <View style={topStyles.metaPanel}>
        <ShareMetaChips
          layout={layout}
          accentColor={accentColor}
          timeTier={timeTier}
          geoTier={geoTier}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brandCluster: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoSlot: {
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "Inter_700Bold",
    color: SHARE_COLORS.text,
    flexShrink: 0,
  },
  divider: {
    alignSelf: "stretch",
    backgroundColor: SHARE_COLORS.divider,
  },
});

const topStyles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    alignItems: "flex-start",
    flexShrink: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
  },
  metaPanel: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SHARE_COLORS.chipBorder,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});
