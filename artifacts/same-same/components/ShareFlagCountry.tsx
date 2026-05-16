import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  SHARE_COLORS,
  type ShareLayoutTokens,
} from "@/utils/shareLayoutTokens";

type ShareFlagCountryProps = {
  flag: string;
  country: string;
  /** Teal + slightly larger — use for the matched stranger on Ripple cards. */
  highlight?: boolean;
  highlightColor?: string;
  /** When set, sizes scale for share poster export. */
  layout?: ShareLayoutTokens;
};

export function ShareFlagCountry({
  flag,
  country,
  highlight = false,
  highlightColor,
  layout,
}: ShareFlagCountryProps) {
  const colors = useColors();
  const badge = layout?.flagBadge ?? 44;
  const flagSize = layout?.flagEmoji ?? 26;
  const countrySize = layout
    ? highlight
      ? layout.countryFontHi
      : layout.countryFont
    : highlight
      ? 15
      : 14;
  const accent = highlightColor ?? colors.teal;

  return (
    <View style={[styles.slot, layout && { gap: layout.gapXs }]}>
      <View
        style={[
          styles.badge,
          {
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            backgroundColor: layout ? SHARE_COLORS.chipBg : colors.card,
            borderColor: layout ? SHARE_COLORS.chipBorder : colors.border,
          },
        ]}
      >
        <Text style={[styles.flag, { fontSize: flagSize, lineHeight: flagSize + 4 }]}>
          {flag || "🌍"}
        </Text>
      </View>
      <Text
        style={[
          styles.country,
          {
            fontSize: countrySize,
            color: highlight
              ? accent
              : layout
                ? SHARE_COLORS.text
                : colors.foreground,
          },
          !layout && highlight && styles.countryHighlight,
        ]}
        numberOfLines={2}
      >
        {country || "Somewhere"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  badge: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  flag: {},
  country: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: 0.15,
  },
  countryHighlight: {
    letterSpacing: 0.2,
  },
});
