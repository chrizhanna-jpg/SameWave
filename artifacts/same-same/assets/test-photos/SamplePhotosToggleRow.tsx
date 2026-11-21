import React from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Txt } from "@/components/Txt";
import { writeSamplePhotosToggle } from "@/core/testPhotos";
import { space } from "@/theme";

/**
 * Account row for the preview-only sample Match deck. Lives under
 * `assets/test-photos/` so Metro swaps it for a null stub when
 * EXPO_PUBLIC_TEST_PHOTOS is off — keeping the label out of production.
 */
export function SamplePhotosToggleRow({
  on,
  setOn,
}: {
  on: boolean;
  setOn: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.fill}>
        <Txt variant="quiet" tone="secondary">
          Sample photos (preview)
        </Txt>
        <Txt>{on ? "On — Match deck includes fixtures" : "Off"}</Txt>
      </View>
      <Button
        kind="quiet"
        label={on ? "Turn off" : "Turn on"}
        onPress={() => {
          const next = !on;
          setOn(next);
          void writeSamplePhotosToggle(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
  },
  fill: { flex: 1 },
});
