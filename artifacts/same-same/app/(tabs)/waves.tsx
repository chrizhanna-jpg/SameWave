import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { WorldMap } from "@/components/WorldMap";
import { useAppState } from "@/state/AppState";
import { space } from "@/theme";

/** A keepsake: the world, and a line for each Wave you have had. Touch a line to see it again. */
export default function WavesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { waves, wavesKnown, countryCode, sync } = useAppState();

  const empty = wavesKnown && waves.length === 0;
  const unreachable = !wavesKnown && (sync === "offline" || sync === "failed");

  return (
    <Screen bare>
      <View style={[styles.fill, { paddingTop: insets.top + space.lg }]}>
        <WorldMap
          waves={waves}
          homeCountry={countryCode}
          onOpenWave={(id) => router.push({ pathname: "/wave/[id]", params: { id } })}
        />
        <View style={styles.words} pointerEvents="none">
          {empty ? (
            <Txt tone="haze" center>
              Your Waves will appear here
            </Txt>
          ) : unreachable ? (
            <Txt tone="haze" center>
              Can't reach SameWave right now
            </Txt>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  words: { height: 72, justifyContent: "center", paddingHorizontal: space.lg },
});
