import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { GeoTier, TimeTier } from "@/utils/celebrations";
import { SHARE_COLORS, type ShareLayoutTokens } from "@/utils/shareLayoutTokens";

type MatchContextChipsProps = {
  themeTitle: string;
  themeEmoji: string;
  timeTier: TimeTier;
  geoTier: GeoTier;
  /** Flash overlays vs dark share posters. */
  mode?: "flash" | "share";
  accentColor?: string;
  onDark?: boolean;
  align?: "center" | "left";
  layout?: ShareLayoutTokens;
};

const META_FILL = "rgba(255, 255, 255, 0.9)";
const META_BORDER = "rgba(0, 16, 24, 0.14)";
const META_FILL_ON_DARK = "rgba(255, 255, 255, 0.94)";
const META_BORDER_ON_DARK = "rgba(255, 255, 255, 0.28)";

/**
 * Theme chip on its own row; “same day / same world” chips side-by-side below.
 * Theme uses accent fill on share posters and accent-outline on flash cards.
 */
export function MatchContextChips({
  themeTitle,
  themeEmoji,
  timeTier,
  geoTier,
  mode = "flash",
  accentColor = SHARE_COLORS.ripple,
  onDark = false,
  align = "center",
  layout,
}: MatchContextChipsProps) {
  const isShare = mode === "share";
  const metaFill = onDark || isShare ? META_FILL_ON_DARK : META_FILL;
  const metaBorder = onDark || isShare ? META_BORDER_ON_DARK : META_BORDER;

  const themeFont = layout
    ? Math.round(layout.chipThemeFont)
    : isShare
      ? 15
      : 16;
  const themeEmojiSize = layout
    ? Math.round(layout.chipThemeEmoji)
    : isShare
      ? 17
      : 18;
  const metaFont = layout ? layout.chipFont : 12;
  const metaEmoji = layout ? layout.chipEmoji : 14;
  const padH = layout?.chipPadH ?? 14;
  const padV = layout?.chipPadV ?? 8;
  const padThemeV = layout?.chipThemePadV ?? padV + 2;
  const minMetaH = layout?.chipMinH ?? 36;
  const gap = layout?.gapXs ?? 6;
  const rowGap = layout?.chipGap ?? 8;

  const metaPill = {
    paddingHorizontal: padH,
    paddingVertical: padV,
    borderRadius: layout?.radiusChip ?? 999,
    borderWidth: layout?.chipBorder ?? 1,
    backgroundColor: metaFill,
    borderColor: metaBorder,
    minHeight: minMetaH,
  };

  const themePill = isShare
    ? {
        paddingHorizontal: padH + 4,
        paddingVertical: padThemeV,
        borderRadius: layout?.radiusChip ?? 999,
        borderWidth: Math.max(2, (layout?.chipBorder ?? 1) + 1),
        backgroundColor: accentColor,
        borderColor: "rgba(255,255,255,0.35)",
        minHeight: layout?.chipThemeMinH ?? minMetaH + 4,
      }
    : {
        paddingHorizontal: padH + 2,
        paddingVertical: padThemeV,
        borderRadius: layout?.radiusChip ?? 999,
        borderWidth: 2,
        backgroundColor: SHARE_COLORS.navy,
        borderColor: accentColor,
        minHeight: minMetaH + 2,
      };

  const themeTextColor = "#FFFFFF";
  const metaTextColor = "#001018";

  return (
    <View
      style={[
        styles.stack,
        align === "left" && styles.stackLeft,
        layout && {
          gap: rowGap,
          maxWidth: isShare ? layout.inner : undefined,
        },
        isShare && styles.stackShareWidth,
      ]}
    >
      <View style={[styles.pill, themePill, { gap }]}>
        <Text style={{ fontSize: themeEmojiSize }}>{themeEmoji}</Text>
        <Text
          style={[
            styles.themeText,
            { fontSize: themeFont, color: themeTextColor },
          ]}
          numberOfLines={2}
        >
          {themeTitle}
        </Text>
      </View>

      <View
        style={[
          styles.metaRow,
          align === "left" && styles.metaRowLeft,
          { gap: rowGap },
        ]}
      >
        <View style={[styles.pill, metaPill, { gap }]}>
          <Text style={{ fontSize: metaEmoji }}>{timeTier.emoji}</Text>
          <Text style={[styles.metaText, { fontSize: metaFont, color: metaTextColor }]}>
            {timeTier.label}
          </Text>
        </View>
        <View style={[styles.pill, metaPill, { gap }]}>
          <Text style={{ fontSize: metaEmoji }}>{geoTier.emoji}</Text>
          <Text style={[styles.metaText, { fontSize: metaFont, color: metaTextColor }]}>
            {geoTier.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 340,
  },
  stackLeft: {
    alignItems: "flex-start",
  },
  stackShareWidth: {
    width: "100%",
    maxWidth: "100%",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },
  metaRowLeft: {
    justifyContent: "flex-start",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
    shadowColor: "#001018",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  themeText: {
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  metaText: {
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
    textTransform: "lowercase",
  },
});

type ShareChipLayoutProps = {
  layout: ShareLayoutTokens;
  accentColor: string;
};

/** Topic token — top header row, right-aligned (share posters). */
export function ShareThemeChip({
  layout,
  accentColor,
  themeTitle,
  themeEmoji,
}: ShareChipLayoutProps & {
  themeTitle: string;
  themeEmoji: string;
}) {
  const padH = layout.chipPadH;
  const padV = layout.chipThemePadV;
  const gap = layout.gapXs;
  const themeFont = Math.round(layout.chipThemeFont);
  const themeEmojiSize = Math.round(layout.chipThemeEmoji);

  return (
    <View
      style={[
        styles.pill,
        {
          paddingHorizontal: padH + 4,
          paddingVertical: padV,
          borderRadius: layout.radiusChip,
          borderWidth: Math.max(2, layout.chipBorder + 1),
          backgroundColor: accentColor,
          borderColor: "rgba(255,255,255,0.35)",
          minHeight: layout.chipThemeMinH,
          gap,
          flexShrink: 1,
          maxWidth: "46%",
        },
      ]}
    >
      <Text style={{ fontSize: themeEmojiSize }}>{themeEmoji}</Text>
      <Text
        style={[
          styles.themeText,
          { fontSize: themeFont, color: "#FFFFFF" },
        ]}
        numberOfLines={2}
      >
        {themeTitle}
      </Text>
    </View>
  );
}

/** “Same hour / same continent” row — directly under the divider. */
export function ShareMetaChips({
  layout,
  timeTier,
  geoTier,
}: ShareChipLayoutProps & {
  timeTier: TimeTier;
  geoTier: GeoTier;
}) {
  const metaFill = META_FILL_ON_DARK;
  const metaBorder = META_BORDER_ON_DARK;
  const padH = layout.chipPadH;
  const padV = layout.chipPadV;
  const gap = layout.gapXs;
  const rowGap = layout.chipGap;
  const metaFont = layout.chipFont;
  const metaEmoji = layout.chipEmoji;
  const minMetaH = layout.chipMinH;

  const metaPill = {
    paddingHorizontal: padH,
    paddingVertical: padV,
    borderRadius: layout.radiusChip,
    borderWidth: layout.chipBorder,
    backgroundColor: metaFill,
    borderColor: metaBorder,
    minHeight: minMetaH,
  };

  return (
    <View style={[styles.metaRow, styles.metaRowLeft, { gap: rowGap, width: "100%" }]}>
      <View style={[styles.pill, metaPill, { gap }]}>
        <Text style={{ fontSize: metaEmoji }}>{timeTier.emoji}</Text>
        <Text style={[styles.metaText, { fontSize: metaFont, color: "#001018" }]}>
          {timeTier.label}
        </Text>
      </View>
      <View style={[styles.pill, metaPill, { gap, flexShrink: 1 }]}>
        <Text style={{ fontSize: metaEmoji }}>{geoTier.emoji}</Text>
        <Text
          style={[styles.metaText, { fontSize: metaFont, color: "#001018" }]}
          numberOfLines={1}
        >
          {geoTier.label}
        </Text>
      </View>
    </View>
  );
}
