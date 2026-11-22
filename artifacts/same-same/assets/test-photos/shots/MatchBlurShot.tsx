import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SoftIconDisc } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { MATCH_RIPPLE_INK, RippleMark } from "@/components/RippleMark";
import { WaveJoin } from "@/components/WaveJoin";
import { PHOTO_BLUR_IN_RADIUS } from "@/core/photoBlurIn";
import { waveLayoutMetrics } from "@/device/waveLayoutMetrics";
import { colors, layout, space } from "@/theme";

const ACTION_SIZE = 64;
const CLOSE_SIZE = layout.iconButtonSize;

/**
 * Preview-only: Match full-bleed mid-load (blur, no spinner/copy) vs sharp + soft discs.
 * `/match-blur-shot?phase=mid` | `phase=done` | `phase=fade` (fade kept as mid alias).
 */
export function MatchBlurShotInner() {
  const windowDims = useWindowDimensions();
  const metrics = useMemo(
    () => waveLayoutMetrics(),
    [windowDims.width, windowDims.height],
  );
  const [bleedSize, setBleedSize] = useState(metrics);
  useEffect(() => {
    setBleedSize(metrics);
  }, [metrics]);
  const { width, height } = bleedSize;
  const insets = useSafeAreaInsets();
  const { phase: raw } = useLocalSearchParams<{ phase?: string }>();
  // "fade" kept as a URL alias of mid — Chris removed the entrance fade.
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

  const bottomSoft = phase !== "done";

  return (
    <View
      style={styles.root}
      accessibilityLabel={
        phase === "mid" ? "Match mid-load shot" : "Match after-load shot"
      }
      onLayout={(event) => {
        const { width: w, height: h } = event.nativeEvent.layout;
        if (w < 1 || h < 1) return;
        setBleedSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }}
    >
      <View style={styles.bleed} pointerEvents="none">
        <WaveJoin
          width={width}
          height={height}
          top={{
            uri: sample.top.uri,
            quiet: true,
            accessibilityLabel: "Your photo",
          }}
          bottom={{
            uri: sample.bottom.uri,
            quiet: true,
            // Soft from frame 1 while loading; sharp once "done".
            blurRadius: bottomSoft ? PHOTO_BLUR_IN_RADIUS : undefined,
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

      <View
        style={[styles.chrome, { paddingTop: insets.top + space.sm }]}
        pointerEvents="none"
      >
        <SoftIconDisc size={CLOSE_SIZE}>
          <Icon name="close" color={colors.slate} />
        </SoftIconDisc>
      </View>

      {phase === "done" ? (
        <View
          style={[
            styles.actions,
            { paddingBottom: Math.max(insets.bottom, space.md) + space.sm },
          ]}
          pointerEvents="none"
        >
          <SoftIconDisc size={ACTION_SIZE}>
            <Icon name="close" size={28} color={colors.slate} />
          </SoftIconDisc>
          <PhotoMetaChip
            compact
            emotion={sample.bottom.emotion}
            topic={sample.bottom.theme}
          />
          <SoftIconDisc size={ACTION_SIZE}>
            <RippleMark size={48} color={MATCH_RIPPLE_INK} animated={false} />
          </SoftIconDisc>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  bleed: { ...StyleSheet.absoluteFill },
  bottomWash: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
    zIndex: 2,
  },
  chrome: {
    position: "absolute",
    left: space.md,
    right: space.md,
    top: 0,
    zIndex: 4,
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
