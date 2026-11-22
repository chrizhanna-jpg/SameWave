import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Frost } from "@/components/Frost";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { Txt } from "@/components/Txt";
import { WaveJoin } from "@/components/WaveJoin";
import { WaveSimilarityLine } from "@/components/WaveSimilarityLine";
import { matchBonuses } from "@/core/bonuses";
import type { Wave } from "@/core/types";
import { colors, space } from "@/theme";

/**
 * Preview-only: full-screen pair chrome headline + Discover sheet headline.
 */
export function WaveSheetShotInner() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const pack = useMemo(() => {
    if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadSampleWaves } = require("@/core/testPhotos") as {
      loadSampleWaves: () => Wave[];
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TEST_PHOTO_META } = require("../fixtures") as {
      TEST_PHOTO_META: readonly { id: string; theme: string; emotion: string }[];
    };
    const waves = loadSampleWaves();
    const wave =
      waves.find((w) => w.id.includes("same_month")) ?? waves[0] ?? null;
    if (!wave) return null;
    return {
      wave,
      mine: TEST_PHOTO_META.find((m) => m.id === wave.mine.photoId) ?? null,
      theirs: TEST_PHOTO_META.find((m) => m.id === wave.theirs.photoId) ?? null,
    };
  }, []);
  if (!pack) return <View style={styles.root} />;
  const { wave, mine, theirs } = pack;

  const bonuses = matchBonuses(
    { takenAt: wave.mine.takenAt, countryCode: wave.mine.countryCode },
    { takenAt: wave.theirs.takenAt, countryCode: wave.theirs.countryCode },
  );

  return (
    <View style={styles.root} accessibilityLabel="Wave similarity sheet shot">
      <WaveJoin
        width={width}
        height={height}
        top={{ uri: wave.mine.uri, accessibilityLabel: "Your photo" }}
        bottom={{ uri: wave.theirs.uri, accessibilityLabel: "Their photo" }}
      />
      <View style={[styles.chrome, { paddingBottom: insets.bottom + space.lg }]}>
        <WaveSimilarityLine headline={bonuses.headline} surface="photo" />
      </View>
      <View style={[styles.panel, { paddingBottom: insets.bottom + space.lg }]}>
        <Frost kind="card" style={styles.panelFrost} contentStyle={styles.panelInner}>
          <View style={styles.panelHandle} accessibilityLabel="Hide details" />
          <WaveSimilarityLine headline={bonuses.headline} surface="sheet" style={styles.sheetHeadline} />
          <Txt variant="quiet" tone="quiet">
            You
          </Txt>
          <PhotoMetaChip emotion={mine?.emotion} topic={mine?.theme} style={styles.sideMeta} />
          <Txt variant="quiet" tone="quiet" style={styles.them}>
            Them
          </Txt>
          <PhotoMetaChip emotion={theirs?.emotion} topic={theirs?.theme} style={styles.sideMeta} />
        </Frost>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  chrome: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    bottom: 120,
    alignItems: "center",
  },
  panel: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: 0,
  },
  panelFrost: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  panelInner: { paddingHorizontal: space.lg, paddingTop: space.md },
  panelHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space.lg,
  },
  sheetHeadline: { marginTop: space.xs, marginBottom: space.md },
  sideMeta: { alignItems: "flex-start", marginTop: space.xs, marginBottom: space.sm },
  them: { marginTop: space.sm },
});
