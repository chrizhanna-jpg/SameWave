import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Icon } from "@/components/Icon";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

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
  const { unreadEchoes } = useApp();
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
