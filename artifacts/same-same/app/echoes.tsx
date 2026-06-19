import React, { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";

/** Legacy route — Ripples & Waves inbox now lives on the Waves tab. */
export default function EchoesScreen() {
  useEffect(() => {
    router.replace("/(tabs)/waves");
  }, []);
  return <View />;
}
