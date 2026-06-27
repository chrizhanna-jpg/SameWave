import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { getGeoTierForPhotos, getTimeTierForMatch } from "@/utils/celebrations";
import type { Match } from "@/context/AppContext";

/**
 * Compact two-chip row showing the time tier and geo tier of a match.
 * Used inside the match history / passes screens. Kept narrow so it
 * fits in the column between the two photo thumbnails.
 */
export function MatchTierChips({
  match,
  myCountryCode,
}: {
  match: Match;
  myCountryCode?: string;
}) {
  const colors = useColors();
  const time = getTimeTierForMatch(match);
  const geo = getGeoTierForPhotos(
    match.myCaptureCountryCode,
    match.theirCaptureCountryCode,
  );
  // "Same Hour" is now the rarest/premium emitted tier (the calendar ladder
  // no longer produces "minute"); give it gold, "Same Day" teal, rest muted.
  const timeColor =
    time.kind === "hour"
      ? colors.gold
      : time.kind === "day"
      ? colors.teal
      : colors.mutedForeground;
  const geoShort =
    geo.kind === "continent"
      ? geo.label.replace(/^Same Continent · /i, "")
      : geo.kind === "country"
      ? "Same country"
      : "Same planet";
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: timeColor + "1f",
            borderColor: timeColor + "55",
          },
        ]}
      >
        <Text style={[styles.text, { color: timeColor }]} numberOfLines={1}>
          {time.emoji} {time.label}
        </Text>
      </View>
      <View
        style={[
          styles.chip,
          { backgroundColor: colors.muted, borderColor: colors.border },
        ]}
      >
        <Text
          style={[styles.text, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {geo.emoji} {geoShort}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 3,
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  text: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
});
