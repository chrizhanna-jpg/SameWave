import { Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/TabBar";
import { colors } from "@/theme";

/** The whole app: Ripple, and Waves. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.pond } }}
    >
      <Tabs.Screen name="index" options={{ title: "Ripple" }} />
      <Tabs.Screen name="waves" options={{ title: "Waves" }} />
    </Tabs>
  );
}
