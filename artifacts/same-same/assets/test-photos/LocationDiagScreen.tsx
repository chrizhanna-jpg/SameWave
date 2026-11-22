/**
 * Full location-diag screen body — Metro-stubbed in production exports.
 */
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { testPhotosBuildEnabled, withOptionalSampleWaves } from "@/core/testPhotos";
import { useAppState } from "@/state/AppState";
import { colors, space } from "@/theme";

import { LocationDiagPanel } from "./LocationDiagPanel";

export function LocationDiagScreenInner() {
  const insets = useSafeAreaInsets();
  const { waves, ripples } = useAppState();
  const mapWaves = useMemo(
    () =>
      withOptionalSampleWaves(waves, {
        useSamplePhotos: testPhotosBuildEnabled(),
      }),
    [waves],
  );

  return (
    <Screen>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header />
        <Txt variant="title" style={styles.heading}>
          Location diag
        </Txt>
        <LocationDiagPanel waves={mapWaves} ripples={ripples} />
        <View style={{ height: Math.max(insets.bottom, space.md) }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  heading: { paddingHorizontal: space.lg, marginBottom: space.sm },
});
