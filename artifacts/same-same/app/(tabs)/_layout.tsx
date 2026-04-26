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
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { onAllTabsVisited } from "@/utils/tabVisits";
import { detectCountryFromGPS } from "@/utils/gpsCountry";
import { flagFor, nameFor } from "@/data/countries";

const RUN_GPS_CHECK = !__DEV__;

function TabIcon({
  name,
  color,
  focused,
  activeColor,
}: {
  name: string;
  color: string;
  focused: boolean;
  activeColor: string;
}) {
  return (
    <View style={tabIconStyles.wrap}>
      <View
        style={[
          tabIconStyles.dot,
          {
            backgroundColor: focused ? activeColor : "transparent",
          },
        ]}
      />
      <Icon name={name as never} size={focused ? 24 : 22} color={color} />
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
    width: 5,
    height: 5,
    borderRadius: 2.5,
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
          ...(isWeb ? { height: 84 } : { height: 70 }),
          paddingTop: 6,
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
        name="discover"
        options={{
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
          title: "My Waves",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name="globe"
              color={color}
              focused={focused}
              activeColor={colors.primary}
            />
          ),
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
        }}
      />
    </Tabs>
  );
}
