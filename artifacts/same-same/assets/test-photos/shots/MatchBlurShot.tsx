import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import { ActivityIndicator, Platform, StyleSheet, useWindowDimensions, View } from "react-native";

import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { WaveJoin } from "@/components/WaveJoin";
import { PHOTO_BLUR_IN_RADIUS } from "@/core/photoBlurIn";
import { colors, space } from "@/theme";

/**
 * Preview-only: Match bottom half mid-load (blur + spinner, no Scrim) vs sharp.
 * `/match-blur-shot?phase=mid` | `phase=done`
 */
export function MatchBlurShotInner() {
  const { width, height } = useWindowDimensions();
  const { phase: raw } = useLocalSearchParams<{ phase?: string }>();
  const phase = raw === "done" ? "done" : "mid";

  const sample = useMemo(() => {
    if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require("../catalog") as {
      getTestPhotoCandidates: () => {
        id: string;
        uri: string;
        emotion: string | null;
        theme: string | null;
      }[];
    };
    const rows = catalog.getTestPhotoCandidates();
    return { top: rows[0] ?? null, bottom: rows[1] ?? null };
  }, []);
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
        bottom={{
          uri: sample.bottom.uri,
          // Mid: soft via overlay below (MaskedView blur is flaky on web).
          accessibilityLabel: "Their photo",
        }}
      />
      {phase === "mid" ? (
        <View
          style={[styles.emptyWrap, { top: height / 2, bottom: 0 }]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: sample.bottom.uri }}
            style={[
              StyleSheet.absoluteFill,
              Platform.OS === "web"
                ? ({ filter: `blur(${PHOTO_BLUR_IN_RADIUS}px)` } as object)
                : null,
            ]}
            contentFit="cover"
            blurRadius={Platform.OS === "web" ? 0 : PHOTO_BLUR_IN_RADIUS}
          />
          <ActivityIndicator color={colors.textPrimary} style={styles.spinner} />
        </View>
      ) : (
        <View
          style={[styles.metaChip, { top: height / 2 + space.lg, bottom: 80 }]}
          pointerEvents="none"
        >
          <PhotoMetaChip emotion={sample.bottom.emotion} topic={sample.bottom.theme} />
        </View>
      )}
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
    zIndex: 2,
    overflow: "hidden",
  },
  spinner: { zIndex: 3 },
  metaChip: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    zIndex: 3,
    justifyContent: "flex-end",
    alignItems: "center",
  },
});
