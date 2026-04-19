import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Badge } from "@/context/AppContext";

interface Props {
  badge: Badge;
}

const BADGE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  explorer: "globe",
  connector: "link",
  similar: "heart",
  streak5: "zap",
  asia: "map-pin",
  africa: "map-pin",
  americas: "map-pin",
};

export function BadgeCard({ badge }: Props) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: badge.earned ? colors.card : colors.secondary,
          borderColor: badge.earned ? colors.primary : colors.border,
          opacity: badge.earned ? 1 : 0.5,
        },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: badge.earned ? colors.primary + "22" : colors.muted,
          },
        ]}
      >
        <Feather
          name={BADGE_ICONS[badge.id] || "award"}
          size={22}
          color={badge.earned ? colors.primary : colors.mutedForeground}
        />
      </View>
      <Text
        style={[
          styles.name,
          { color: badge.earned ? colors.foreground : colors.mutedForeground },
        ]}
      >
        {badge.name}
      </Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>
        {badge.description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    width: 140,
    gap: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  desc: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 14,
  },
});
