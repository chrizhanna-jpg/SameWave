import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import tokens from "@/constants/colors";

interface SurfaceProps {
  children?: React.ReactNode;
  elevation?: "none" | "sm" | "md" | "lg";
  radius?: keyof typeof tokens.radii;
  background?: string;
  style?: StyleProp<ViewStyle>;
}

export function Surface({
  children,
  elevation = "md",
  radius = "lg",
  background = tokens.light.card,
  style,
}: SurfaceProps) {
  const shadow = elevation === "none" ? undefined : tokens.shadows[elevation];
  return (
    <View
      style={[
        {
          backgroundColor: background,
          borderRadius: tokens.radii[radius],
        },
        shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}
