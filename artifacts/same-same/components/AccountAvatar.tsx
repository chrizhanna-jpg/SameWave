import { useUser } from "@clerk/expo";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Txt } from "@/components/Txt";
import { colors, layout } from "@/theme";

interface Props {
  onPress: () => void;
  size?: number;
}

/** Round profile mark for the home toolbar — photo when Clerk has one, else initial. */
export function AccountAvatar({ onPress, size = layout.iconButtonSize }: Props) {
  const { user } = useUser();
  const uri = user?.imageUrl ?? null;
  const initial = (
    user?.firstName?.trim()?.[0] ||
    user?.username?.trim()?.[0] ||
    user?.primaryEmailAddress?.emailAddress?.trim()?.[0] ||
    "A"
  ).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={layout.hitSlop}
      accessibilityRole="button"
      accessibilityLabel="Account"
      style={[styles.hit, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
          <Txt variant="button" tone="primary">
            {initial}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    // Existing surface at opacity — frosted well over Style 3 scenes.
    backgroundColor: "rgba(222, 242, 254, 0.62)",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(199, 232, 254, 0.55)",
  },
});
