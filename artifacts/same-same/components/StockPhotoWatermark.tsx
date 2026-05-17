import React from "react";
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const LOGO = require("@/assets/images/samewave-logo.png");

const SIZES = {
  sm: { logo: 22 },
  md: { logo: 28 },
  lg: { logo: 34 },
} as const;

type Size = keyof typeof SIZES;

type Props = {
  size?: Size;
  style?: StyleProp<ViewStyle>;
};

/** Top-right SameWave logo on curated stock / placeholder photos (no frame). */
export function StockPhotoWatermark({ size = "md", style }: Props) {
  const s = SIZES[size];
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="image"
      accessibilityLabel="SameWave placeholder photo"
    >
      <Image
        source={LOGO}
        style={{ width: s.logo, height: s.logo }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 6,
    right: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
