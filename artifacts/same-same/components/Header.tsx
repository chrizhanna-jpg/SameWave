import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { layout, space } from "@/theme";

interface Props {
  /** "back" for screens you step into, "close" for ones that sit on top. */
  icon?: Extract<IconName, "back" | "close">;
  onPress?: () => void;
}

/** The way back, top left. Nothing else lives in a header. */
export function Header({ icon = "back", onPress }: Props) {
  const router = useRouter();
  const leave = () => {
    if (onPress) onPress();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  return (
    <View style={styles.row}>
      <Pressable
        onPress={leave}
        hitSlop={layout.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={icon === "back" ? "Back" : "Close"}
        style={styles.button}
      >
        <Icon name={icon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 44, justifyContent: "center", marginBottom: space.sm },
  button: { width: 44, height: 44, justifyContent: "center", marginLeft: -space.sm, alignItems: "center" },
});
