import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * The SameWave logo wave — coloured overlapping ribbons (light blue / blue /
 * white / green), colours unchanged. Used on the Match button over a frosted
 * well so the artwork stays legible.
 *
 * Source: `assets/images/samewave-glyph.png` (transparent crop of the logo wave).
 */
const GLYPH = require("../assets/images/samewave-glyph.png") as number;

/** Native glyph aspect ≈ 974×444. */
const ASPECT = 974 / 444;

interface Props {
  /** Display width of the wave artwork. Height follows the logo aspect. */
  width?: number;
  style?: StyleProp<ViewStyle>;
}

export function WaveMark({ width = 44, style }: Props) {
  const height = Math.round(width / ASPECT);
  return (
    <View style={[styles.wrap, { width, height }, style]} pointerEvents="none">
      <Image
        source={GLYPH}
        style={{ width, height }}
        contentFit="contain"
        accessibilityLabel="Wave"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
