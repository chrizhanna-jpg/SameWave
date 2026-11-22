import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SoftIconDisc } from "@/components/Frost";
import { RippleMark } from "@/components/RippleMark";
import { Txt } from "@/components/Txt";
import { colors, space } from "@/theme";

/**
 * Preview-only shot of the Match ripple button (RippleMark + SoftIconDisc circle).
 */
export function RippleMarkShotInner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root} accessibilityLabel="Ripple mark shot">
      <Txt style={styles.label}>Match · Offer a Ripple</Txt>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}>
        <SoftIconDisc size={64}>
          <RippleMark size={48} animated={false} />
        </SoftIconDisc>
      </View>
      <View style={styles.closeUp}>
        <SoftIconDisc size={168}>
          <RippleMark size={140} animated={false} />
        </SoftIconDisc>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1A2425",
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
  closeUp: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
