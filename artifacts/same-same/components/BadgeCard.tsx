import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { Surface } from "@/components/Surface";
import type { Badge } from "@/context/AppContext";

interface Props {
  badge: Badge;
}

const BADGE_ICONS: Record<string, string> = {
  explorer: "globe",
  connector: "link",
  sameday: "zap",
  streak5: "star",
  asia: "map-pin",
  africa: "map-pin",
  americas: "map-pin",
};

export function BadgeCard({ badge }: Props) {
  const colors = useColors();
  const earned = badge.earned;

  return (
    <Surface
      elevation={earned ? "md" : "sm"}
      radius="lg"
      background={earned ? colors.card : colors.bgElevated}
      style={[
        styles.container,
        !earned && { opacity: 0.55 },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: earned ? colors.primary + "22" : colors.muted,
          },
          earned && colors.shadows.glowPrimary,
        ]}
      >
        <Icon
          name={(BADGE_ICONS[badge.id] || "award") as never}
          size={22}
          color={earned ? colors.primary : colors.mutedForeground}
        />
      </View>
      <Text
        style={[
          styles.name,
          { color: earned ? colors.foreground : colors.mutedForeground },
        ]}
      >
        {badge.name}
      </Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>
        {badge.description}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: "center",
    width: 140,
    gap: 8,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.1,
  },
  desc: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 14,
  },
});
