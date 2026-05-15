import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  size?: "sm" | "md" | "lg";
  color?: string;
  showTagline?: boolean;
  taglineColor?: string;
  /** Default: left (Ripple tab header). Use `center` for centered lockups. */
  align?: "left" | "center";
};

const SIZE_MAP = {
  sm: { word: 18, tagline: 10, gap: 1, letterSpacing: 1 },
  md: { word: 30, tagline: 12, gap: 3, letterSpacing: 1.5 },
  lg: { word: 46, tagline: 14, gap: 5, letterSpacing: 2 },
} as const;

// Compact typographic wordmark used in places that don't have the full
// globe lockup (e.g. the match-screen header). The globe-integrated
// version lives in EchoGlobeLogo.
export function EchoLogo({
  size = "md",
  color = "#0F172A",
  showTagline = true,
  taglineColor = "#64748B",
  align = "left",
}: Props) {
  const s = SIZE_MAP[size];
  const centered = align === "center";
  return (
    <View
      style={[
        styles.wrap,
        centered ? styles.wrapCentered : styles.wrapStretch,
      ]}
    >
      <Text
        style={[
          styles.word,
          centered ? styles.wordCentered : styles.wordLeft,
          { color, fontSize: s.word, letterSpacing: s.letterSpacing },
        ]}
      >
        SameWave
      </Text>
      {showTagline && (
        <Text
          style={[
            styles.tagline,
            centered ? styles.taglineCentered : styles.taglineLeft,
            { color: taglineColor, fontSize: s.tagline, marginTop: s.gap },
          ]}
        >
          send a ripple, catch a wave
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-start",
  },
  wrapStretch: {
    alignSelf: "stretch",
  },
  wrapCentered: {
    alignItems: "center",
    alignSelf: "center",
  },
  word: {
    fontFamily: "Inter_700Bold",
  },
  wordLeft: {
    textAlign: "left",
    alignSelf: "stretch",
  },
  wordCentered: {
    textAlign: "center",
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
    textTransform: "lowercase",
  },
  taglineLeft: {
    textAlign: "left",
    alignSelf: "stretch",
  },
  taglineCentered: {
    textAlign: "center",
  },
});

export default EchoLogo;
