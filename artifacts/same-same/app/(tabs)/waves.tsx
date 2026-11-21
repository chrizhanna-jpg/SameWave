import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { WorldMap } from "@/components/WorldMap";
import { useAppState } from "@/state/AppState";
import { space } from "@/theme";

/**
 * The quiet keepsake of past Waves. Threads on the map are the only list;
 * tapping one opens that Wave again. Nothing on the map is not yours.
 */
export default function WavesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { waves, wavesKnown, countryCode, sync } = useAppState();
  const [drawingIds, setDrawingIds] = useState<string[]>([]);
  const drawn = useRef(new Set<string>());
  const firstPass = useRef(true);

  // A newly arrived Wave draws its thread like a ripple across the world.
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
        ? { title: "No Waves yet", body: "Your Ripple is out there. Good things take time." }
        : unreachable
          ? { title: "Can't reach SameWave right now", body: null }
          : null,
    [empty, unreachable],
  );

  return (
    <Screen bare>
      <View style={[styles.fill, { paddingTop: insets.top + space.sm }]}>
        <WorldMap
          waves={waves}
          homeCountry={countryCode}
          drawingIds={drawingIds}
          onOpenWave={(id) => router.push({ pathname: "/wave/[id]", params: { id } })}
        />
        {emptyCopy ? (
          <View style={styles.words} pointerEvents="none">
            <Txt tone="secondary" center>
              {emptyCopy.title}
            </Txt>
            {emptyCopy.body ? (
              <Txt variant="quiet" tone="quiet" center style={styles.body}>
                {emptyCopy.body}
              </Txt>
            ) : null}
          </View>
        ) : (
          <View style={styles.words} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  words: {
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  body: { marginTop: space.xs },
});
