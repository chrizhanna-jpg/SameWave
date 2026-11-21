import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Frost } from "@/components/Frost";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { WorldMap } from "@/components/WorldMap";
import { useAppState } from "@/state/AppState";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { space } from "@/theme";

/**
 * Waves tab (Ripple | Waves): keepsake map of past Waves.
 * Plain app background (no scene photo); map is edge-to-edge.
 * Only completed Waves appear here.
 */
export default function WavesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { waves, wavesKnown, countryCode, sync } = useAppState();
  const [drawingIds, setDrawingIds] = useState<string[]>([]);
  const drawn = useRef(new Set<string>());
  const firstPass = useRef(true);

  useEffect(() => {
    if (waves.length === 0) return;
    if (firstPass.current) {
      firstPass.current = false;
      for (const wave of waves) drawn.current.add(wave.id);
      return;
    }
    const fresh = waves.map((w) => w.id).filter((id) => !drawn.current.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) drawn.current.add(id);
    setDrawingIds(fresh);
    const timer = setTimeout(() => setDrawingIds([]), 3200);
    return () => clearTimeout(timer);
  }, [waves]);

  const empty = wavesKnown && waves.length === 0;
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

  return (
    <Screen bare scene="none">
      <View style={[styles.fill, { paddingTop: insets.top + space.sm, paddingBottom: tabClearance }]}>
        <View style={styles.map}>
          <WorldMap
            waves={waves}
            homeCountry={countryCode}
            drawingIds={drawingIds}
            onOpenWave={(id) => router.push({ pathname: "/wave/[id]", params: { id } })}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /** Edge-to-edge map — no side pad, no frosted inset card. */
  map: { flex: 1 },
  wordsCard: { marginHorizontal: space.md, marginBottom: space.sm },
  words: {
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
  },
  wordsSpacer: { minHeight: 24 },
  body: { marginTop: space.xs },
});
