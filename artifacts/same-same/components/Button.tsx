import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type ViewStyle,
} from "react-native";

import { Txt } from "@/components/Txt";
import { colors, layout, radius, space } from "@/theme";

interface Props {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  /**
   * main: the one gold button a screen may have.
   * soft: a second, calmer choice.
   * quiet: a line of text.
   */
  kind?: "main" | "soft" | "quiet";
  tone?: "haze" | "mist" | "ember";
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  kind = "main",
  tone,
  disabled,
  busy,
  style,
  accessibilityHint,
}: Props) {
  const inactive = disabled || busy;
  if (kind === "quiet") {
    return (
      <Pressable
        onPress={onPress}
        disabled={inactive}
        hitSlop={layout.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [styles.quiet, (pressed || inactive) && styles.dim, style]}
      >
        <Txt variant="quiet" tone={tone ?? "haze"} center>
          {label}
        </Txt>
      </Pressable>
    );
  }
  const main = kind === "main";
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        styles.base,
        main ? styles.main : styles.soft,
        pressed && styles.pressed,
        disabled && styles.dim,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={main ? colors.moonInk : colors.mist} />
      ) : (
        <Txt variant="button" tone={main ? "moonInk" : "mist"}>
          {label}
        </Txt>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: layout.buttonHeight,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    alignSelf: "stretch",
  },
  main: { backgroundColor: colors.moon },
  soft: {
    backgroundColor: colors.pondLift,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.pondEdge,
  },
  quiet: { paddingVertical: space.sm, paddingHorizontal: space.md, alignSelf: "center" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  dim: { opacity: 0.5 },
});
