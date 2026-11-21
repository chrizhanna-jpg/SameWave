import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Txt } from "@/components/Txt";
import { colors, layout, space } from "@/theme";

/** Shape expo-router passes to a custom `tabBar` render prop. */
interface TabBarProps {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  descriptors: Record<string, { options: { title?: string } }>;
  /** Expo Router helper — prefer this over raw navigation. */
  navigateToTab: (routeKey: string) => void;
}

/** The app's two destinations, as two words. */
export function TabBar({ state, descriptors, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const title = descriptors[route.key]?.options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={title}
            hitSlop={layout.hitSlop}
            style={styles.item}
            onPress={() => {
              if (!focused) navigateToTab(route.key);
            }}
          >
            <Txt variant="button" tone={focused ? "primary" : "secondary"} style={!focused && styles.rest}>
              {title}
            </Txt>
            <View style={[styles.mark, focused && styles.markOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.xxl,
    paddingTop: space.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  item: {
    minWidth: layout.iconButtonSize,
    minHeight: layout.iconButtonSize,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  rest: { opacity: 0.8 },
  mark: { marginTop: space.sm, width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent" },
  markOn: { backgroundColor: colors.waterMid },
});
