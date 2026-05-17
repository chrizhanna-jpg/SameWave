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
  sm: { box: 26, logo: 20, pad: 3, radius: 8 },
  md: { box: 32, logo: 24, pad: 4, radius: 9 },
  lg: { box: 40, logo: 30, pad: 5, radius: 10 },
} as const;

type Size = keyof typeof SIZES;

type Props = {
  size?: Size;
  style?: StyleProp<ViewStyle>;
};

/** Top-right SameWave mark on curated stock / placeholder photos. */
export function StockPhotoWatermark({ size = "md", style }: Props) {
  const s = SIZES[size];
  return (
    <View
      style={[
        styles.wrap,
        {
          width: s.box,
          height: s.box,
          borderRadius: s.radius,
          padding: s.pad,
        },
        style,
      ]}
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
    backgroundColor: "rgba(7, 24, 40, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
});
