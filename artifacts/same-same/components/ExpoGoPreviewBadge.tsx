import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  EXPO_GO_PREVIEW_LABEL,
  EXPO_GO_PREVIEW_SKIP_SIGN_IN,
} from "@/utils/expoGoPreview";

/**
 * Small pill that only renders in the Expo Go preview bundle. If it is not on
 * screen, the phone is running some other build of SameWave (for example the
 * installed Play / TestFlight app), not the Metro preview.
 */
export function ExpoGoPreviewBadge() {
  const insets = useSafeAreaInsets();
  if (!EXPO_GO_PREVIEW_SKIP_SIGN_IN) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 2 }]}
    >
      <Text style={styles.text}>{EXPO_GO_PREVIEW_LABEL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(232, 190, 90, 0.92)",
  },
  text: {
    color: "#10213f",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
