import { Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/TabBar";

/** The whole app: Ripple, and Waves — scenes show through a frosted tab bar. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Ripple" }} />
      <Tabs.Screen name="waves" options={{ title: "Waves" }} />
    </Tabs>
  );
}
