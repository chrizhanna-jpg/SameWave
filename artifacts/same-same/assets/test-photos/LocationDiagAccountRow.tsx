import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Txt } from "@/components/Txt";
import { colors, space } from "@/theme";

/** Preview-only Account entry to the location diagnostic (Metro-stubbed in prod). */
export function LocationDiagAccountRow() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/location-diag")}
      accessibilityRole="button"
      accessibilityLabel="Location diagnostic"
      style={styles.row}
    >
      <View style={styles.fill}>
        <Txt variant="quiet" tone="secondary">
          Preview
        </Txt>
        <Txt>Location diagnostic</Txt>
      </View>
      <Txt tone="secondary">Open</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
});
