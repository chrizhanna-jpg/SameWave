import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Txt } from "@/components/Txt";
import { space } from "@/theme";

const ICON = require("../assets/images/icon.png") as number;

interface Props {
  /** Larger mark for the splash / waiting canvas. */
  size?: number;
  /** Show the word SameWave under the mark. */
  withName?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The existing SameWave icon — never redesigned. Used on splash and the main screen. */
export function BrandMark({ size = 72, withName = false, style }: Props) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="image" accessibilityLabel="SameWave">
      <Image source={ICON} style={{ width: size, height: size }} contentFit="contain" />
      {withName ? (
        <Txt variant="title" center style={styles.name}>
          SameWave
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  name: { marginTop: space.md },
});
