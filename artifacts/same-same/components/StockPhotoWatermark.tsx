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
  sm: 34,
  md: 44,
  lg: 56,
  xl: 72,
} as const;

type Size = keyof typeof SIZES;

type Props = {
  size?: Size;
  style?: StyleProp<ViewStyle>;
};

/** Top-left SameWave logo on curated stock / placeholder photos (logo only). */
export function StockPhotoWatermark({ size = "md", style }: Props) {
  const logo = SIZES[size];
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="image"
      accessibilityLabel="SameWave placeholder photo"
    >
      <Image
        source={LOGO}
        style={{ width: logo, height: logo }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 6,
    left: 6,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
});
