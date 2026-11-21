import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Frost } from "@/components/Frost";
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

/** Frosted bottom bar over the Style 3 scene (TIDE / Weather style). */
export function TabBar({ state, descriptors, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <Frost
        kind="bar"
        intensity={55}
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}
        contentStyle={styles.row}
      >
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
              <Txt
                variant="button"
                tone={focused ? "primary" : "secondary"}
                style={!focused && styles.rest}
              >
                {title}
              </Txt>
              <View style={[styles.mark, focused && styles.markOn]} />
            </Pressable>
          );
        })}
      </Frost>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Overlay the scene — zero layout height so screens go edge to edge. */
  anchor: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  bar: {
    paddingTop: space.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.xxl,
  },
  item: {
    minWidth: layout.iconButtonSize,
    minHeight: layout.iconButtonSize,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  rest: { opacity: 0.8 },
  mark: {
    marginTop: space.sm,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  markOn: { backgroundColor: colors.waterMid },
});
