import { Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/TabBar";
import { TabBarHeightProvider } from "@/state/TabBarHeight";

/**
 * Bottom nav: Home → Ripple → Waves.
 * Opens on Home by default; push / auto-reveal still take precedence via root hosts.
 */
export const unstable_settings = {
  // Expo Router 58: prefer `anchor` over deprecated `initialRouteName`.
  anchor: "home",
  initialRouteName: "home",
};

export default function TabsLayout() {
  return (
    <TabBarHeightProvider>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "transparent" },
        }}
      >
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="ripple" options={{ title: "Ripple" }} />
        <Tabs.Screen name="waves" options={{ title: "Waves" }} />
      </Tabs>
    </TabBarHeightProvider>
  );
}
