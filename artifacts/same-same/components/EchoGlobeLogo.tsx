import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GlobeAnimation } from "@/components/GlobeAnimation";

type Props = {
  globeSize?: number;
  color?: string;
  taglineColor?: string;
  showTagline?: boolean;
};

// Brand wordmark colours — mirrors the attached app-icon artwork:
// "Same" in clean white, "Wave" in bright cyan-blue. The cyan is a
// touch lighter / more luminous than the primary brand cyan so the
// wordmark reads on dark backgrounds the way it does in the icon.
const SAME_COLOR = "#FFFFFF";
const WAVE_COLOR = "#5DC3F5";

// Hero lockup that matches the SameWave app-icon artwork: animated
// globe on top, two-tone "SameWave" wordmark below, tagline beneath.
export function EchoGlobeLogo({
  globeSize = 190,
  color = SAME_COLOR,
  taglineColor = "rgba(255,255,255,0.65)",
  showTagline = true,
}: Props) {
  // Word size scales with the globe so the lockup stays balanced at
  // any size the screen requests.
  const wordSize = Math.round(globeSize * 0.18);
  const taglineSize = Math.max(11, Math.round(globeSize * 0.07));

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.globeWrap,
          { width: globeSize, height: globeSize },
        ]}
      >
        <GlobeAnimation size={globeSize} />
      </View>

      {/* Two-tone wordmark sits below the globe, matching the icon. */}
      <Text
        style={[
          styles.word,
          {
            fontSize: wordSize,
            letterSpacing: Math.max(0.5, Math.round(wordSize * 0.04)),
            marginTop: Math.round(globeSize * 0.08),
          },
        ]}
      >
        <Text style={{ color }}>Same</Text>
        <Text style={{ color: WAVE_COLOR }}>Wave</Text>
      </Text>

      {showTagline && (
        <Text
          style={[
            styles.tagline,
            {
              color: taglineColor,
              fontSize: taglineSize,
              marginTop: Math.round(globeSize * 0.05),
            },
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
    alignItems: "center",
  },
  globeWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  word: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    includeFontPadding: false,
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.2,
    textTransform: "lowercase",
    textAlign: "center",
  },
});

export default EchoGlobeLogo;
