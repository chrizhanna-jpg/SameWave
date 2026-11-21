import React from "react";
import { Text, type TextProps } from "react-native";

import { colors, type } from "@/theme";

type Variant = keyof typeof type;
type Tone = "mist" | "haze" | "moon" | "moonInk" | "ember";

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

/** All text in the app goes through here so it always uses the theme. */
export function Txt({ variant = "body", tone = "mist", center, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[type[variant], { color: colors[tone] }, center && { textAlign: "center" }, style]}
    />
  );
}
