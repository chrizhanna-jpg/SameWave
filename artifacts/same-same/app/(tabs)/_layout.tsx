import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Icon } from "@/components/Icon";
import React, { useEffect, useRef } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { SHOW_DISCOVER_TAB } from "@/constants/featureFlags";
import { useApp } from "@/context/AppContext";
import { onAllTabsVisited } from "@/utils/tabVisits";
import {
  TAB_BAR_PADDING_TOP,
  tabBarBottomInset,
  tabBarTotalHeight,
} from "@/utils/tabBarSafeArea";
import { detectCountryFromGPS } from "@/utils/gpsCountry";
import { flagFor, nameFor } from "@/data/countries";

const RUN_GPS_CHECK = !__DEV__;

function TabIcon({
  name,
  color,
  focused,
  activeColor,
  sizeFocused = 24,
  sizeUnfocused = 22,
  glyphFit,
  wrapWidth,
  iconScale = 1,
  iconOffsetY = 0,
  showActiveDot = true,
  dotSize = 5,
}: {
  name: string;
  color: string;
  focused: boolean;
  activeColor: string;
  sizeFocused?: number;
  sizeUnfocused?: number;
  glyphFit?: "wide" | "square";
  wrapWidth?: number;
  iconScale?: number;
  iconOffsetY?: number;
  showActiveDot?: boolean;
  dotSize?: number;
}) {
  const iconEl = (
    <Icon
      name={name as never}
      size={focused ? sizeFocused : sizeUnfocused}
      color={color}
      glyphFit={glyphFit}
    />
  );

  return (
    <View
      style={[
        tabIconStyles.wrap,
        wrapWidth != null ? { width: wrapWidth } : null,
      ]}
    >
      {showActiveDot ? (
        <View
          style={[
            tabIconStyles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              marginBottom: dotSize >= 5 ? 4 : 3,
              backgroundColor: focused ? activeColor : "transparent",
            },
          ]}
        />
      ) : null}
      {iconScale !== 1 || iconOffsetY !== 0 ? (
        <View
          style={{
            transform: [
              ...(iconScale !== 1 ? [{ scale: iconScale }] : []),
              ...(iconOffsetY !== 0 ? [{ translateY: iconOffsetY }] : []),
            ],
            alignItems: "center",
          }}
        >
          {iconEl}
        </View>
      ) : (
        iconEl
      )}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "flex-start",
    width: 44,
    paddingTop: 2,
  },
  dot: {
    marginBottom: 4,
  },
});

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";
  const insets = useSafeAreaInsets();
  const tabBottomInset = tabBarBottomInset(insets);
  const tabBarHeight = isWeb ? 84 : tabBarTotalHeight(insets);
  const {
    unreadEchoes,
    myCountryCode,
    myCountryName,
    myCountryFlag,
    setMyCountry,
  } = useApp();

  const gpsRanRef = useRef(false);
  useEffect(() => {
    if (!RUN_GPS_CHECK) return;
    if (!myCountryCode) return;
    let cancelled = false;
    const unsubscribe = onAllTabsVisited(() => {
      if (cancelled || gpsRanRef.current) return;
      gpsRanRef.current = true;
      void (async () => {
        const detected = await detectCountryFromGPS();
        if (cancelled) return;
        if (!detected) return;
        if (detected.code === myCountryCode) return;
        const detectedName =
          detected.name ?? nameFor(detected.code) ?? detected.code;
        const detectedFlag = flagFor(detected.code);
        Alert.alert(
          "Quick double-check",
          `It looks like you're in ${detectedFlag} ${detectedName} right now. Keep your pick of ${myCountryFlag ?? ""} ${myCountryName ?? ""} anyway?`,
          [
            {
              text: `Use ${detectedName}`,
              onPress: () =>
                setMyCountry(detected.code, detectedName, detectedFlag),
            },
            {
              text: `Keep ${myCountryName ?? "my pick"}`,
              style: "cancel",
            },
          ],
        );
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [myCountryCode, myCountryName, myCountryFlag, setMyCountry]);

  const echoBadge =
    unreadEchoes > 0 ? (unreadEchoes > 9 ? "9+" : String(unreadEchoes)) : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        // Freeze unfocused tabs: their render tree, effects, timers and
        // requestAnimationFrame loops (e.g. the Atlas globe animation, the
        // Ripple deck's vibe-music effect) stop running while the tab is in
        // the background. This is what keeps music from playing after you
        // leave Ripple, stops the Atlas RAF from draining the CPU behind
        // other tabs, and makes tab switches snappy instead of laggy.
        freezeOnBlur: true,
        // Don't mount a tab's screen until it's first focused — a cold start
        // only pays for the Home tab, not every heavy screen at once.
        lazy: true,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_600SemiBold",
          marginTop: 2,
          letterSpacing: 0.2,
        },
        tabBarStyle: {
          ...(isIOS || isWeb ? { position: "absolute" } : {}),
          backgroundColor: isIOS ? "transparent" : colors.bgElevated,
          borderTopWidth: 0,
          elevation: isAndroid ? 16 : 0,
          shadowColor: "#000",
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -4 },
          height: tabBarHeight,
          paddingTop: TAB_BAR_PADDING_TOP,
          paddingBottom: tabBottomInset,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={90}
              tint="dark"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.borderSubtle,
                },
              ]}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: colors.bgElevated,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.borderSubtle,
                },
              ]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="home"
              color={color}
              focused={focused}
              activeColor={colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="match"
        options={{
          title: "Ripple",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="ripple"
              color={color}
              focused={focused}
              activeColor={colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="waves"
        options={{
          title: "Waves",
          tabBarBadge: echoBadge,
          tabBarBadgeStyle: {
            backgroundColor: colors.gold,
            color: "#001018",
            fontSize: 10,
            fontWeight: "700",
            minWidth: 16,
            height: 16,
            lineHeight: 16,
            paddingHorizontal: 4,
          },
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="wave-glyph"
              color={color}
              focused={focused}
              activeColor={colors.primary}
              glyphFit="square"
              iconScale={2}
              dotSize={5}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="atlas"
        options={{
          title: "Atlas",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="spiral"
              color={color}
              focused={focused}
              activeColor={colors.primary}
              iconScale={1.1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          href: SHOW_DISCOVER_TAB ? undefined : null,
          title: "Discover",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="compass"
              color={color}
              focused={focused}
              activeColor={colors.primary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "My Path",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="map"
              color={color}
              focused={focused}
              activeColor={colors.primary}
            />
          ),
        }}
      />
    </Tabs>
  );
}
