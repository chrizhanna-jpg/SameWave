import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { MatchContextChips } from "@/components/MatchContextChips";
import { CaptureTimeNote } from "@/components/CaptureTimeNote";
import type { GeoTier, TimeTier } from "@/utils/celebrations";
import type { ShareLayoutTokens } from "@/utils/shareLayoutTokens";

type CelebrationMatchChipsProps = {
  themeTitle: string;
  themeEmoji: string;
  timeTier: TimeTier;
  geoTier: GeoTier;
  /** Matched stranger's country — grouped with chips on flash overlays. */
  countryName?: string;
  countryFlag?: string;
  onDark?: boolean;
  layout?: ShareLayoutTokens;
  accentColor?: string;
};

/** Ripple/Wave flash overlay — country + theme + time/geo in one panel. */
export function CelebrationMatchChips({
  countryName,
  countryFlag,
  ...props
}: CelebrationMatchChipsProps) {
  const showCountry = Boolean(countryName?.trim());

  return (
    <View style={styles.panel}>
      {showCountry ? (
        <View style={styles.countryRow}>
          {countryFlag ? (
            <Text style={styles.countryFlag} accessibilityElementsHidden>
              {countryFlag}
            </Text>
          ) : null}
          <Text style={styles.countryName} numberOfLines={2}>
            {countryName}
          </Text>
        </View>
      ) : null}

      {showCountry ? <View style={styles.panelDivider} /> : null}

      <MatchContextChips
        mode="flash"
        align="center"
        accentColor={props.accentColor}
        onDark={props.onDark}
        layout={props.layout}
        themeTitle={props.themeTitle}
        themeEmoji={props.themeEmoji}
        timeTier={props.timeTier}
        geoTier={props.geoTier}
      />

      {/* Soft, neutral note + camera nudge — only when the tier fell back to
          share time because a photo had no capture date. Lives on the light
          celebration panel, so use the on-light ink. */}
      {props.timeTier.usedShareFallback ? (
        <CaptureTimeNote onLight align="center" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    backgroundColor: "rgba(255, 255, 255, 0.52)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 16, 24, 0.1)",
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
    shadowColor: "#001018",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  countryRow: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  countryFlag: {
    fontSize: 36,
    lineHeight: 42,
  },
  countryName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    fontWeight: "800",
    color: "#001018",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  panelDivider: {
    alignSelf: "stretch",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0, 16, 24, 0.12)",
  },
});
