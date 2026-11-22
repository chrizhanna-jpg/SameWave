import { Redirect } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Photo } from "@/components/Photo";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import type { Wave } from "@/core/types";
import { waveListPlace, waveListWhen } from "@/core/waveListMeta";
import { colors, space, type as typeStyle } from "@/theme";

const LIST_THUMB = 64;

/**
 * Preview-only: city-stack pull-up with paired thumbs, place name, meta chip, locale time.
 */
export default function WavesListShotScreen() {
  const insets = useSafeAreaInsets();
  const rows = useMemo(() => {
    if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadSampleWaves } = require("@/core/testPhotos") as {
      loadSampleWaves: () => Wave[];
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TEST_PHOTO_META } = require("../assets/test-photos/fixtures") as {
      TEST_PHOTO_META: readonly { id: string; theme: string; emotion: string }[];
    };
    return loadSampleWaves()
      .slice(0, 4)
      .map((wave) => {
        const side = wave.theirs;
        const meta = TEST_PHOTO_META.find((m) => m.id === side.photoId) ?? null;
        return {
          wave,
          place: waveListPlace({ countryCode: side.countryCode }),
          when: waveListWhen(side.takenAt ?? wave.formedAt, "en-GB"),
          emotion: meta?.emotion ?? null,
          topic: meta?.theme ?? null,
        };
      });
  }, []);

  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    return <Redirect href="/" />;
  }

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.lg }]} accessibilityLabel="Waves list shot">
      <View style={styles.listCard}>
        <View style={styles.listHandle} />
        <Text style={styles.listTitle}>{rows.length} Waves here</Text>
        {rows.map(({ wave, place, when, emotion, topic }) => (
          <Pressable key={wave.id} style={styles.listRow}>
            <View style={styles.listPair}>
              <View style={styles.listThumb}>
                <Photo
                  uri={wave.mine.uri}
                  blurIn
                  style={styles.listThumbImg}
                  accessibilityLabel="Your photo"
                />
              </View>
              <View style={styles.listThumb}>
                <Photo
                  uri={wave.theirs.uri}
                  blurIn
                  style={styles.listThumbImg}
                  accessibilityLabel="Their photo"
                />
              </View>
            </View>
            <View style={styles.listMeta}>
              <Text style={styles.listRowText} numberOfLines={1}>
                {place}
              </Text>
              <PhotoMetaChip emotion={emotion} topic={topic} style={styles.listChip} />
              {when ? (
                <Text style={styles.listRowSub} numberOfLines={1}>
                  {when}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(15, 30, 40, 0.45)",
    justifyContent: "flex-end",
  },
  listCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  listHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space.md,
  },
  listTitle: {
    ...typeStyle.heading,
    color: colors.slate,
    marginBottom: space.xs,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    minHeight: LIST_THUMB + space.md * 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(63,74,75,0.15)",
  },
  listPair: { flexDirection: "row", gap: 6 },
  listThumb: {
    width: LIST_THUMB,
    height: LIST_THUMB,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(63,74,75,0.08)",
  },
  listThumbImg: { width: LIST_THUMB, height: LIST_THUMB },
  listMeta: { flex: 1, gap: 2, justifyContent: "center", minWidth: 0 },
  listChip: { alignItems: "flex-start", marginTop: 1, marginBottom: 1 },
  listRowText: { ...typeStyle.body, color: colors.slate },
  listRowSub: { ...typeStyle.label, color: colors.waterMuted },
});
