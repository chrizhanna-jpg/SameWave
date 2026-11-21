import { LinearGradient } from "expo-linear-gradient";
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
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/** Calm mist canvas. Every quiet screen sits on the same light water. */
export function Screen({
  children,
  scroll,
  center,
  bare,
  style,
  scrollRef,
  contentBottomPad,
  onScroll,
}: Props) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = bare
    ? {}
    : {
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.lg + (contentBottomPad ?? 0),
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
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padding, column, center && styles.center, style]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.background, colors.waterPale]}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
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
