import { Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/TabBar";
import { TabBarHeightProvider } from "@/state/TabBarHeight";

/**
 * Bottom nav: Ripple → Waves → Home.
 * Opens on Home by default; push / auto-reveal still take precedence via root hosts.
 */
export const unstable_settings = {
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
        <Tabs.Screen name="ripple" options={{ title: "Ripple" }} />
        <Tabs.Screen name="waves" options={{ title: "Waves" }} />
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        {/* Hidden: keeps `/` resolving to Home for older replace("/") calls. */}
        <Tabs.Screen name="index" options={{ href: null }} />
      </Tabs>
    </TabBarHeightProvider>
  );
}
