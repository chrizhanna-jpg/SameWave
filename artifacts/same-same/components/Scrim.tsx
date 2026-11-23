import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, space } from "@/theme";

interface Props {
  children: React.ReactNode;
  /** Prefer "light" on pale photos, "dark" on bright ones. Default is a soft dark pill. */
  kind?: "light" | "dark";
  style?: StyleProp<ViewStyle>;
}

/**
 * A small local cushion behind text or a control that sits on a photograph.
 * Never covers the whole image — only the words that need to be read.
 */
export function Scrim({ children, kind = "dark", style }: Props) {
  return (
    <View style={[styles.base, kind === "light" ? styles.light : styles.dark, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignSelf: "center",
  },
  dark: { backgroundColor: colors.overlayDark },
  light: { backgroundColor: colors.overlayLight },
});
