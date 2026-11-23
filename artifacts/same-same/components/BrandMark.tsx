import { Image } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Txt } from "@/components/Txt";
import { space } from "@/theme";

const ICON = require("../assets/images/icon.png") as number;

interface Props {
  /** Mark size when the wordmark is hidden. With the name, the icon matches the wordmark width. */
  size?: number;
  /** Show the word SameWave under the mark. */
  withName?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The existing SameWave icon — never redesigned. Used on splash and the main screen. */
export function BrandMark({ size = 72, withName = false, style }: Props) {
  const [nameWidth, setNameWidth] = useState<number | null>(null);
  const iconSize = withName && nameWidth && nameWidth > 0 ? nameWidth : size;

  return (
    <View style={[styles.wrap, style]} accessibilityRole="image" accessibilityLabel="SameWave">
      <Image source={ICON} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
      {withName ? (
        <Txt
          variant="title"
          center
          style={styles.name}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            if (next > 0 && next !== nameWidth) setNameWidth(next);
          }}
        >
          SameWave
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  /** Intrinsic width so the icon can match the wordmark exactly. */
  name: { marginTop: space.md, alignSelf: "center" },
});
