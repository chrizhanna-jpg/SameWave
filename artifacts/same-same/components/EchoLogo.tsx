import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  size?: "sm" | "md" | "lg";
  color?: string;
  showTagline?: boolean;
  taglineColor?: string;
};

const SIZE_MAP = {
  sm: { word: 22, tagline: 10, gap: 1, letterSpacing: 4 },
  md: { word: 36, tagline: 12, gap: 3, letterSpacing: 6 },
  lg: { word: 56, tagline: 14, gap: 5, letterSpacing: 9 },
} as const;

// Compact typographic wordmark used in places that don't have the full
// globe lockup (e.g. the match-screen header). The globe-integrated
// version lives in EchoGlobeLogo.
export function EchoLogo({
  size = "md",
  color = "#0F172A",
  showTagline = true,
  taglineColor = "#64748B",
}: Props) {
  const s = SIZE_MAP[size];
  return (
    <View style={styles.wrap}>
      <Text
        style={[
          styles.word,
          { color, fontSize: s.word, letterSpacing: s.letterSpacing },
        ]}
      >
        ECHO
      </Text>
      {showTagline && (
        <Text
          style={[
            styles.tagline,
            { color: taglineColor, fontSize: s.tagline, marginTop: s.gap },
          ]}
        >
          same same
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  word: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    letterSpacing: 2,
    textTransform: "lowercase",
    textAlign: "center",
  },
});

export default EchoLogo;
