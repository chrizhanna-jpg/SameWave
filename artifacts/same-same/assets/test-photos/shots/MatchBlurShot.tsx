import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SoftIconDisc } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { RippleMark } from "@/components/RippleMark";
import { WaveJoin } from "@/components/WaveJoin";
import { PHOTO_BLUR_IN_RADIUS } from "@/core/photoBlurIn";
import { waveLayoutMetrics } from "@/device/waveLayoutMetrics";
import { colors, space } from "@/theme";

/**
 * Preview-only: Match full-bleed mid-load (blur) vs sharp + soft circular discs.
 * `/match-blur-shot?phase=mid` | `phase=done` | `phase=fade`
 */
export function MatchBlurShotInner() {
  const windowDims = useWindowDimensions();
  const { width, height } = useMemo(
    () => waveLayoutMetrics(),
    [windowDims.width, windowDims.height],
  );
  const insets = useSafeAreaInsets();
  const { phase: raw } = useLocalSearchParams<{ phase?: string }>();
  const phase = raw === "done" ? "done" : raw === "fade" ? "fade" : "mid";

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

  const opacity = phase === "fade" ? 0.45 : 1;

  return (
    <View
      style={styles.root}
      accessibilityLabel={
        phase === "mid"
          ? "Match mid-load shot"
          : phase === "fade"
            ? "Match fade-in shot"
            : "Match after-load shot"
      }
    >
      <View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
        <WaveJoin
          width={width}
          height={height}
          top={{
            uri: sample.top.uri,
            accessibilityLabel: "Your photo",
          }}
          bottom={{
            uri: sample.bottom.uri,
            accessibilityLabel: "Their photo",
          }}
        />
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(25, 34, 36, 0)", "rgba(25, 34, 36, 0.32)"]}
        locations={[0.35, 1]}
        style={styles.bottomWash}
      />

      {phase === "mid" || phase === "fade" ? (
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
            transition={0}
          />
          {phase === "mid" ? (
            <ActivityIndicator color={colors.textPrimary} style={styles.spinner} />
          ) : null}
        </View>
      ) : (
        <>
          <View
            style={[
              styles.metaChip,
              {
                top: height / 2 + space.lg,
                bottom: Math.max(insets.bottom, space.md) + 64 + space.lg,
              },
            ]}
            pointerEvents="none"
          >
            <PhotoMetaChip emotion={sample.bottom.emotion} topic={sample.bottom.theme} />
          </View>
          <View
            style={[
              styles.actions,
              { paddingBottom: Math.max(insets.bottom, space.md) + space.sm },
            ]}
            pointerEvents="none"
          >
            <SoftIconDisc size={64}>
              <Icon name="close" size={28} color={colors.textPrimary} />
            </SoftIconDisc>
            <SoftIconDisc size={64}>
              <RippleMark size={48} animated={false} />
            </SoftIconDisc>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  bottomWash: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
    zIndex: 2,
  },
  emptyWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3,
    overflow: "hidden",
  },
  spinner: { zIndex: 4 },
  metaChip: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    zIndex: 3,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  actions: {
    position: "absolute",
    left: space.xl,
    right: space.xl,
    bottom: 0,
    zIndex: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
