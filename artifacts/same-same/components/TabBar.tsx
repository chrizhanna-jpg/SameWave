import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Frost } from "@/components/Frost";
import { Txt } from "@/components/Txt";
import { withOptionalSampleOffers } from "@/core/sampleOffers";
import {
  peekSamplePhotosToggle,
  readSamplePhotosToggle,
  subscribeSamplePhotosToggle,
  testPhotosBuildEnabled,
} from "@/core/testPhotos";
import { useAppState } from "@/state/AppState";
import { useReportTabBarHeight } from "@/state/TabBarHeight";
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

/**
 * Frosted bottom bar. Four labels (Home / Ripple / Waves / Map) must stay
 * fully visible at 320dp and 360dp, including font scale up to 1.3 and the
 * Waves inbox badge — tighten gap + allow font shrink rather than truncate.
 */
export function TabBar({ state, descriptors, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reportHeight = useReportTabBarHeight();
  const { width } = useWindowDimensions();
  const { offers } = useAppState();
  const [useSampleData, setUseSampleData] = useState(
    () => testPhotosBuildEnabled() && peekSamplePhotosToggle() !== false,
  );

  useEffect(() => {
    if (!testPhotosBuildEnabled()) {
      setUseSampleData(false);
      return;
    }
    void readSamplePhotosToggle().then(setUseSampleData);
    return subscribeSamplePhotosToggle(setUseSampleData);
  }, []);

  const badgeCount = withOptionalSampleOffers(offers, { useSampleData }).length;

  const onBarLayout = (event: LayoutChangeEvent) => {
    reportHeight(event.nativeEvent.layout.height);
  };

  // Narrow phones: smaller horizontal gap so four titles + badge fit.
  const gap = width < 360 ? space.sm : width < 400 ? space.md : space.lg;

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <View onLayout={onBarLayout}>
        <Frost
          kind="bar"
          intensity={55}
          style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}
          contentStyle={[styles.row, { gap }]}
        >
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const title = descriptors[route.key]?.options.title ?? route.name;
            const showBadge = route.name === "waves" && badgeCount > 0;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={
                  showBadge ? `${title}, ${badgeCount} waiting` : title
                }
                hitSlop={layout.hitSlop}
                style={styles.item}
                onPress={() => {
                  if (!focused) navigateToTab(route.key);
                }}
              >
                <View style={styles.labelWrap}>
                  <Txt
                    variant="button"
                    tone={focused ? "primary" : "secondary"}
                    style={[styles.label, !focused && styles.rest]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    maxFontSizeMultiplier={1.3}
                    allowFontScaling
                  >
                    {title}
                  </Txt>
                  {showBadge ? (
                    <View style={styles.badge} accessibilityElementsHidden>
                      <Txt
                        variant="caption"
                        tone="white"
                        style={styles.badgeText}
                        maxFontSizeMultiplier={1}
                      >
                        {badgeCount > 9 ? "9+" : String(badgeCount)}
                      </Txt>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.mark, focused && styles.markOn]} />
              </Pressable>
            );
          })}
        </Frost>
      </View>
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
    justifyContent: "space-evenly",
    alignItems: "flex-start",
    paddingHorizontal: space.sm,
  },
  item: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: layout.iconButtonSize,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
  },
  labelWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
  },
  label: {
    flexShrink: 1,
    textAlign: "center",
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
  badge: {
    marginLeft: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.waterMid,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.white,
  },
});
