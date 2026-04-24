import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import tokens from "@/constants/colors";

interface GradientCardProps {
  children?: React.ReactNode;
  gradient?: keyof typeof tokens.gradients;
  radius?: keyof typeof tokens.radii;
  elevation?: keyof typeof tokens.shadows | "none";
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
}

export function GradientCard({
  children,
  gradient = "primary",
  radius = "lg",
  elevation = "md",
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
}: GradientCardProps) {
  const palette = tokens.gradients[gradient];
  const shadow =
    elevation === "none"
      ? undefined
      : tokens.shadows[elevation as keyof typeof tokens.shadows];
  return (
    <View
      style={[
        { borderRadius: tokens.radii[radius] },
        shadow,
        style,
      ]}
    >
      <LinearGradient
        colors={palette as unknown as readonly [string, string, ...string[]]}
        start={start}
        end={end}
        style={{
          borderRadius: tokens.radii[radius],
          overflow: "hidden",
        }}
      >
        {children}
      </LinearGradient>
    </View>
  );
}
