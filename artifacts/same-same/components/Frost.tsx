import { BlurView } from "expo-blur";
import React from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, layout, radius } from "@/theme";

/**
 * Frosted glass fills — ONLY existing palette colours at opacity.
 * surface #DEF2FE, background #E9F6FF, white #FFFFFF. No new hues.
 */
const FILL = {
  card: "rgba(222, 242, 254, 0.58)",
  chrome: "rgba(233, 246, 255, 0.55)",
  bar: "rgba(222, 242, 254, 0.62)",
  whiteSoft: "rgba(255, 255, 255, 0.28)",
} as const;

type Kind = "card" | "chrome" | "bar";

interface FrostProps {
  children?: React.ReactNode;
  kind?: Kind;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  /** Stretch children to fill the frost (default) or center them (icon wells). */
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * When false, children may paint outside the rounded frost (e.g. type-ahead
   * dropdowns). Default clips so BlurView corners stay clean.
   */
  clip?: boolean;
}

function fillFor(kind: Kind): string {
  if (kind === "chrome") return FILL.chrome;
  if (kind === "bar") return FILL.bar;
  return FILL.card;
}

/**
 * Translucent frosted panel (Calm / TIDE / Weather style).
 * BlurView where the platform supports it; always a palette fill underneath.
 */
export function Frost({
  children,
  kind = "card",
  style,
  intensity = 48,
  contentStyle,
  clip = true,
}: FrostProps) {
  const fill = fillFor(kind);
  const shape =
    kind === "card" ? styles.card : kind === "bar" ? styles.bar : styles.chrome;

  return (
    <View style={[shape, style, clip ? styles.clip : styles.noClip]}>
      <BlurView
        intensity={intensity}
        tint="light"
        {...(Platform.OS === "android" ? { blurMethod: "dimezisBlurView" as const } : null)}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} pointerEvents="none" />
      {kind === "card" ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: FILL.whiteSoft }]}
          pointerEvents="none"
        />
      ) : null}
      {children != null ? <View style={[styles.content, contentStyle]}>{children}</View> : null}
    </View>
  );
}

/** Circular frosted hit target for header / toolbar icons. */
export function FrostIconWell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Frost
      kind="chrome"
      intensity={40}
      style={[styles.well, style]}
      contentStyle={styles.wellContent}
    >
      {children}
    </Frost>
  );
}

/**
 * Soft translucent white disc for Match action buttons over photos.
 * Perfect circle: square size, borderRadius = size/2, overflow hidden.
 * No hairline, no BlurView, no elevation (Android elevation shadows read as
 * solid polygonal / hexagon halos behind the disc).
 */
export function SoftIconDisc({
  children,
  size = 64,
  style,
}: {
  children: React.ReactNode;
  /** Outer diameter in points — width, height, and radius all derive from this. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const diameter = Math.max(1, size);
  return (
    <View
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: "rgba(255, 255, 255, 0.32)",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  noClip: { overflow: "visible" },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chrome: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  content: { position: "relative" },
  well: {
    width: layout.iconButtonSize,
    height: layout.iconButtonSize,
    borderRadius: layout.iconButtonSize / 2,
  },
  wellContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
