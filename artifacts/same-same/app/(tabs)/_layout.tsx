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

// Only run the soft GPS sanity check in production / published builds.
// In dev / Expo Go we don't want a permission prompt or alert popping
// up while iterating on other features.
const RUN_GPS_CHECK = !__DEV__;

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";
  // Unread echo count drives a small badge on the My World tab so the
  // "someone connected with your photo" signal is visible from any tab,
  // not just when the user is already on the My Journey screen.
  const {
    unreadEchoes,
    myCountryCode,
    myCountryName,
    myCountryFlag,
    setMyCountry,
  } = useApp();

  // Soft GPS sanity check: once the user has explored every tab at
  // least once, silently take a coarse GPS fix and reverse-geocode it
  // to a country. If the device thinks they're somewhere different from
  // the country they picked at onboarding, show a one-tap "Use detected
  // / Keep my pick" alert. Travellers, expats, dual citizens etc. can
  // override with a single tap. Deferring this until after they've
  // poked around all the tabs means the ~10s GPS fix never blocks the
  // first-impression part of the app.
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
        tabBarStyle: {
          // Only float over content on iOS (blur) and web; Android uses normal flow
          ...(isIOS || isWeb ? { position: "absolute" } : {}),
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: isAndroid ? 8 : 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={90}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Icon name="globe" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="match"
        options={{
          title: "Match",
          tabBarIcon: ({ color }) => (
            <Icon name="layers" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color }) => (
            <Icon name="zap" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "My World",
          tabBarIcon: ({ color }) => (
            <Icon name="globe" size={22} color={color} />
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
