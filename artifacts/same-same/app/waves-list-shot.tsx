import { Redirect } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Photo } from "@/components/Photo";
import type { Wave } from "@/core/types";
import { colors, space, type as typeStyle } from "@/theme";

const LIST_THUMB = 64;

/**
 * Preview-only: city-stack pull-up with paired thumbs (blur-in) + place/time.
 */
export default function WavesListShotScreen() {
  const insets = useSafeAreaInsets();
  const waves = useMemo((): Wave[] => {
    if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadSampleWaves } = require("@/core/testPhotos") as {
      loadSampleWaves: () => Wave[];
    };
    return loadSampleWaves().slice(0, 4);
  }, []);

  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    return <Redirect href="/" />;
  }

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.lg }]} accessibilityLabel="Waves list shot">
      <View style={styles.listCard}>
        <View style={styles.listHandle} />
        <Text style={styles.listTitle}>{waves.length} Waves here</Text>
        {waves.map((wave) => {
          const place = wave.theirs.countryCode ?? wave.mine.countryCode ?? "Somewhere";
          const when = wave.formedAt
            ? new Date(wave.formedAt).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : null;
          return (
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
                <Text style={styles.listRowText}>{place}</Text>
                {when ? <Text style={styles.listRowSub}>{when}</Text> : null}
              </View>
            </Pressable>
          );
        })}
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
  listMeta: { flex: 1, gap: 2, justifyContent: "center" },
  listRowText: { ...typeStyle.body, color: colors.slate },
  listRowSub: { ...typeStyle.label, color: colors.waterMuted },
});
