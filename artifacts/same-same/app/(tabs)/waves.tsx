import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Frost } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { WorldMap } from "@/components/WorldMap";
import { testPhotosBuildEnabled, withOptionalSampleWaves } from "@/core/testPhotos";
import { useAppState } from "@/state/AppState";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { colors, layout, space } from "@/theme";

/**
 * Waves tab: keepsake map of past Waves.
 * When EXPO_PUBLIC_TEST_PHOTOS=1, sample fixtures populate the map so preview
 * can show wave-path lines without a live mutual match.
 */
export default function WavesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { waves, wavesKnown, countryCode, sync } = useAppState();
  const [drawingIds, setDrawingIds] = useState<string[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const drawn = useRef(new Set<string>());
  const firstPass = useRef(true);

  const mapWaves = useMemo(
    () =>
      withOptionalSampleWaves(waves, {
        // Preview map always includes fixtures when the build flag is on so
        // Chris can see paths without flipping Account first. Match still
        // requires the Account toggle.
        useSamplePhotos: testPhotosBuildEnabled(),
      }),
    [waves],
  );

  useEffect(() => {
    if (mapWaves.length === 0) return;
    if (firstPass.current) {
      firstPass.current = false;
      for (const wave of mapWaves) drawn.current.add(wave.id);
      return;
    }
    const fresh = mapWaves.map((w) => w.id).filter((id) => !drawn.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) drawn.current.add(id);
    setDrawingIds(fresh);
    const timer = setTimeout(() => setDrawingIds([]), 3200);
    return () => clearTimeout(timer);
  }, [mapWaves]);

  const empty = wavesKnown && mapWaves.length === 0;
  const unreachable = !wavesKnown && (sync === "offline" || sync === "failed");

  const emptyCopy = useMemo(
    () =>
      empty
        ? {
            title: "No Waves yet",
            body: "When a Ripple finds a match, it lands here on the map.",
          }
        : unreachable
          ? { title: "Can't reach SameWave right now", body: null }
          : null,
    [empty, unreachable],
  );

  const tabClearance = useTabBarClearance(space.md);

  const openWave = (id: string) => {
    router.push({ pathname: "/wave/[id]", params: { id } });
  };

  const openPhoto = (waveId: string, photoId: string) => {
    const wave = mapWaves.find((w) => w.id === waveId);
    if (!wave) return;
    const side = wave.mine.photoId === photoId ? wave.mine : wave.theirs;
    if (side.uri) {
      setPhotoUri(side.uri);
      return;
    }
    // No local URI — open the paired view focused on the ceremony.
    openWave(waveId);
  };

  return (
    <Screen bare scene="none">
      <View style={[styles.fill, { paddingTop: insets.top + space.sm, paddingBottom: tabClearance }]}>
        <View style={styles.map}>
          <WorldMap
            waves={mapWaves}
            homeCountry={countryCode}
            drawingIds={drawingIds}
            onOpenWave={openWave}
            onOpenPhoto={openPhoto}
          />
        </View>
        {emptyCopy ? (
          <Frost kind="card" style={styles.wordsCard} contentStyle={styles.words}>
            <Txt tone="secondary" center>
              {emptyCopy.title}
            </Txt>
            {emptyCopy.body ? (
              <Txt variant="quiet" tone="quiet" center style={styles.body}>
                {emptyCopy.body}
              </Txt>
            ) : null}
          </Frost>
        ) : (
          <View style={styles.wordsSpacer} />
        )}
      </View>

      <Modal visible={Boolean(photoUri)} animationType="fade" onRequestClose={() => setPhotoUri(null)}>
        <View style={[styles.photoRoot, { paddingTop: insets.top + space.sm }]}>
          <Pressable
            onPress={() => setPhotoUri(null)}
            hitSlop={layout.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.photoClose}
          >
            <Icon name="close" color={colors.white} size={28} />
          </Pressable>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoFull} contentFit="contain" />
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  map: { flex: 1 },
  wordsCard: { marginHorizontal: space.md, marginBottom: space.sm },
  words: {
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  /** No dead band under the map when Waves are present. */
  wordsSpacer: { height: 0 },
  body: { marginTop: space.xs },
  photoRoot: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
  },
  photoClose: {
    position: "absolute",
    left: space.md,
    top: space.md,
    zIndex: 2,
    padding: space.sm,
  },
  photoFull: { width: "100%", height: "100%" },
});
