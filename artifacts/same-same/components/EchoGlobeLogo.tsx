import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GlobeAnimation } from "@/components/GlobeAnimation";

type Props = {
  globeSize?: number;
  color?: string;
  taglineColor?: string;
  showTagline?: boolean;
};

// Hero lockup: SEMO label sits across the globe (the "world" is part of
// the logo). "same same" tagline below.
export function SemoGlobeLogo({
  globeSize = 190,
  color = "#FFFFFF",
  taglineColor = "rgba(255,255,255,0.65)",
  showTagline = true,
}: Props) {
  // Word size scales with the globe so SEMO always sits comfortably across
  // the equator. No plate — the text floats directly on the globe with a
  // soft dark glow behind it for legibility against the rotating colours.
  const wordSize = Math.round(globeSize * 0.24);
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
        {/* Label overlay — sits across the equator, transparent */}
        <View
          pointerEvents="none"
          style={[
            styles.labelLayer,
            { width: globeSize, height: globeSize },
          ]}
        >
          <Text
            style={[
              styles.word,
              {
                color,
                fontSize: wordSize,
                letterSpacing: Math.round(wordSize * 0.18),
              },
            ]}
          >
            SEMO
          </Text>
        </View>
      </View>
      {showTagline && (
        <Text
          style={[
            styles.tagline,
            {
              color: taglineColor,
              fontSize: taglineSize,
              marginTop: Math.round(globeSize * 0.06),
            },
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
  globeWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  labelLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  word: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    includeFontPadding: false,
    textShadowColor: "rgba(0, 0, 0, 0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    letterSpacing: 3,
    textTransform: "lowercase",
    textAlign: "center",
  },
});

export default SemoGlobeLogo;
