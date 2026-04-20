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
  // the equator. The label has a translucent dark plate behind it so it
  // reads cleanly against any of the globe's colours.
  const wordSize = Math.round(globeSize * 0.22);
  const plateH = Math.round(wordSize * 1.4);
  const plateW = Math.round(globeSize * 0.78);
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
        {/* Label overlay — sits across the equator */}
        <View
          pointerEvents="none"
          style={[
            styles.labelLayer,
            { width: globeSize, height: globeSize },
          ]}
        >
          <View
            style={[
              styles.plate,
              {
                width: plateW,
                height: plateH,
                borderRadius: plateH / 2,
              },
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
  plate: {
    backgroundColor: "rgba(2, 16, 33, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 209, 102, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  word: {
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    includeFontPadding: false,
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    letterSpacing: 3,
    textTransform: "lowercase",
    textAlign: "center",
  },
});

export default SemoGlobeLogo;
