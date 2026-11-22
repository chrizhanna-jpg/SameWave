import { Redirect, useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";

import { WaveJoin } from "@/components/WaveJoin";
import { PHOTO_BLUR_IN_RADIUS } from "@/core/photoBlurIn";
import { colors, space } from "@/theme";

/**
 * Preview-only: Match bottom half mid-load (blur + spinner, no Scrim) vs sharp.
 * `/match-blur-shot?phase=mid` | `phase=done`
 */
export default function MatchBlurShotScreen() {
  const { width, height } = useWindowDimensions();
  const { phase: raw } = useLocalSearchParams<{ phase?: string }>();
  const phase = raw === "done" ? "done" : "mid";

  const sample = useMemo(() => {
    if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require("../assets/test-photos/catalog") as {
      getTestPhotoCandidates: () => { id: string; uri: string }[];
    };
    const rows = catalog.getTestPhotoCandidates();
    return { top: rows[0] ?? null, bottom: rows[1] ?? null };
  }, []);

  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    return <Redirect href="/" />;
  }
  if (!sample?.top || !sample.bottom) {
    return <View style={styles.root} />;
  }

  return (
    <View
      style={styles.root}
      accessibilityLabel={phase === "mid" ? "Match mid-load shot" : "Match after-load shot"}
    >
      <WaveJoin
        width={width}
        height={height}
        top={{
          uri: sample.top.uri,
          accessibilityLabel: "Your photo",
        }}
        bottom={
          phase === "mid"
            ? {
                uri: sample.bottom.uri,
                blurRadius: PHOTO_BLUR_IN_RADIUS,
                accessibilityLabel: "Their photo",
              }
            : {
                uri: sample.bottom.uri,
                accessibilityLabel: "Their photo",
              }
        }
      />
      {phase === "mid" ? (
        <View
          style={[styles.emptyWrap, { top: height / 2, bottom: 80 }]}
          pointerEvents="none"
        >
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  emptyWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.lg,
    zIndex: 2,
  },
});
