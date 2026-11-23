import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SceneBackdrop } from "@/components/SceneBackdrop";
import { sceneFor, type SceneId } from "@/data/scenes";
import { colors, layout, space } from "@/theme";

/** Minimal scroll handle — avoids RN 0.81 ScrollView ref typing quirks. */
export type ScreenScroll = {
  scrollTo: (options: { x?: number; y?: number; animated?: boolean }) => void;
};

interface Props {
  children: React.ReactNode;
  /** Lets long content scroll. Short screens should not need it. */
  scroll?: boolean;
  /** Centres the content vertically. */
  center?: boolean;
  /** Draws edge to edge, for the camera, the map and the Wave reveal. */
  bare?: boolean;
  style?: ViewStyle;
  /** Scroll handle so a screen can bring a focused field above the keyboard. */
  scrollRef?: React.MutableRefObject<ScreenScroll | null>;
  /** Extra bottom padding inside a scrolling screen (for keyboard room). */
  contentBottomPad?: number;
  /**
   * When set, replaces the default bottom padding (safe-area + space.lg +
   * contentBottomPad). Use for tab screens that clear an absolute tab bar via
   * useTabBarClearance().
   */
  reserveBottom?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /**
   * Style 3 full-bleed backdrop. Bundled calm photo scene, home illustration,
   * a photo URI (compose), or "none" for camera / true bare photography.
   */
  scene?: SceneId | "homeIllustration" | "none";
  /** When set, the backdrop is this Ripple/Wave photo instead of a scene. */
  photoUri?: string | null;
  /** Soft palette wash over a photograph for text legibility. Default true. */
  sceneWash?: boolean;
}

/** Style 3 canvas: full-bleed calm scene (or photo) under frosted content. */
export function Screen({
  children,
  scroll,
  center,
  bare,
  style,
  scrollRef,
  contentBottomPad,
  reserveBottom,
  onScroll,
  scene = sceneFor.home,
  photoUri,
  sceneWash = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = bare
    ? {}
    : {
        paddingTop: insets.top + space.lg,
        paddingBottom:
          reserveBottom != null
            ? reserveBottom
            : insets.bottom + space.lg + (contentBottomPad ?? 0),
        paddingHorizontal: space.lg,
      };
  const column: ViewStyle = {
    width: "100%",
    maxWidth: bare ? undefined : layout.maxContentWidth,
    alignSelf: "center",
  };

  const body = scroll ? (
    <ScrollView
      ref={(node) => {
        if (!scrollRef) return;
        scrollRef.current = node
          ? { scrollTo: (options) => node.scrollTo(options) }
          : null;
      }}
      style={styles.fill}
      contentContainerStyle={[padding, column, center && styles.centerScroll, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // Android: rely on adjustResize + this inset helper; avoid fighting a
      // KeyboardAvoidingView padding jump on the compose field curtain.
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padding, column, center && styles.center, style]}>{children}</View>
  );

  const backdrop =
    photoUri != null && photoUri.length > 0
      ? ({ kind: "uri" as const, uri: photoUri })
      : scene === "none"
        ? ({ kind: "none" as const })
        : scene === "homeIllustration"
          ? ({ kind: "homeIllustration" as const })
          : ({ kind: "scene" as const, id: scene });

  return (
    <View style={styles.root}>
      <SceneBackdrop
        source={backdrop}
        wash={sceneWash && (backdrop.kind === "scene" || backdrop.kind === "uri")}
      />
      {/* Fallback canvas for bare/camera — existing background only. */}
      {backdrop.kind === "none" ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
      ) : null}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  centerScroll: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
});
