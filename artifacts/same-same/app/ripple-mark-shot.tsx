import { Redirect } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FrostIconWell } from "@/components/Frost";
import { RippleMark } from "@/components/RippleMark";
import { Txt } from "@/components/Txt";
import { colors, space } from "@/theme";

/**
 * Preview-only shot of the Match ripple button (real RippleMark + FrostIconWell).
 * Omitted from production when EXPO_PUBLIC_TEST_PHOTOS is not "1".
 */
export default function RippleMarkShotScreen() {
  const insets = useSafeAreaInsets();
  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") {
    return <Redirect href="/" />;
  }
  return (
    <View style={styles.root} accessibilityLabel="Ripple mark shot">
      <Txt style={styles.label}>Match · Offer a Ripple</Txt>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}>
        <FrostIconWell style={styles.well}>
          <RippleMark size={56} animated={false} />
        </FrostIconWell>
      </View>
      <View style={styles.closeUp}>
        <FrostIconWell style={styles.wellLarge}>
          <RippleMark size={140} animated={false} />
        </FrostIconWell>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#6B9BB8",
  },
  label: {
    marginTop: 64,
    textAlign: "center",
    color: colors.white,
    fontWeight: "700",
  },
  actions: {
    position: "absolute",
    right: space.lg,
    bottom: 0,
  },
  well: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  closeUp: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wellLarge: {
    width: 168,
    height: 168,
    borderRadius: 84,
    alignItems: "center",
    justifyContent: "center",
  },
});
