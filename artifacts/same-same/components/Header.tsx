import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { FrostIconWell } from "@/components/Frost";
import { Icon, type IconName } from "@/components/Icon";
import { colors, layout, space } from "@/theme";

interface Props {
  /** "back" for screens you step into, "close" for ones that sit on top. */
  icon?: Extract<IconName, "back" | "close">;
  onPress?: () => void;
}

/** Frosted back/close control — Style 3 header chrome over the scene. */
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
      >
        <FrostIconWell>
          <Icon name={icon} color={colors.textPrimary} />
        </FrostIconWell>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 48, justifyContent: "center", marginBottom: space.sm },
});
