import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  uri: string;
  size?: "sm" | "md" | "lg";
  style?: object;
}

export function PhotoCard({ uri, size = "md", style }: Props) {
  const colors = useColors();

  const dimensions = {
    sm: { width: 100, height: 100, borderRadius: 12 },
    md: { width: 160, height: 160, borderRadius: 16 },
    lg: { width: "100%", height: 240, borderRadius: 20 },
  }[size];

  return (
    <View
      style={[
        styles.container,
        {
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: dimensions.borderRadius,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={[
          styles.image,
          { borderRadius: dimensions.borderRadius },
        ]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderWidth: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
