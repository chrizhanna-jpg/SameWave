import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, layout, space } from "@/theme";

interface Props {
  children: React.ReactNode;
  /** Lets long content scroll. Short screens should not need it. */
  scroll?: boolean;
  /** Centres the content vertically. */
  center?: boolean;
  /** Draws edge to edge, for the camera, the map and the Wave reveal. */
  bare?: boolean;
  style?: ViewStyle;
}

/** Calm mist canvas. Every quiet screen sits on the same light water. */
export function Screen({ children, scroll, center, bare, style }: Props) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = bare
    ? {}
    : {
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.lg,
        paddingHorizontal: space.lg,
      };
  const column: ViewStyle = {
    width: "100%",
    maxWidth: bare ? undefined : layout.maxContentWidth,
    alignSelf: "center",
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.background, colors.waterPale]}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[padding, column, center && styles.centerScroll, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, padding, column, center && styles.center, style]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },
  centerScroll: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
});
