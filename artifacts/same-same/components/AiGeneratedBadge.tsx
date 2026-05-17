import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

type Size = "sm" | "md" | "lg";

const SIZE: Record<
  Size,
  { height: number; fontSize: number; offset: number; padH: number }
> = {
  sm: { height: 20, fontSize: 8, offset: 4, padH: 6 },
  md: { height: 22, fontSize: 9, offset: 6, padH: 7 },
  lg: { height: 26, fontSize: 10, offset: 8, padH: 8 },
};

type Props = {
  size?: Size;
  style?: ViewStyle;
};

/** Top-right provenance label for AI-detected uploads. */
export function AiGeneratedBadge({ size = "md", style }: Props) {
  const colors = useColors();
  const dim = SIZE[size];

  return (
    <View
      style={[
        styles.badge,
        {
          top: dim.offset,
          right: dim.offset,
          height: dim.height,
          borderRadius: dim.height / 2,
          paddingHorizontal: dim.padH,
          backgroundColor: colors.primary,
        },
        style,
      ]}
      accessibilityLabel="AI generated photo"
    >
      <Text
        style={{
          color: colors.primaryForeground,
          fontSize: dim.fontSize,
          fontFamily: "Inter_700Bold",
          letterSpacing: 0.2,
        }}
        numberOfLines={1}
      >
        AI generated
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    maxWidth: "72%",
  },
});
