import React, { useEffect } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Icon } from "@/components/Icon";
import { INTERESTS_FLOW } from "@/constants/interestsFlow";
import { useColors } from "@/hooks/useColors";
import { recordInterestsTelemetry } from "@/utils/rippleNavigation";

export type FlowIntentVariant = "challenge" | "interests";

type ChallengeData = {
  title: string;
  emoji: string;
  description: string;
};

type Props = {
  variant: FlowIntentVariant;
  /** Required when variant is `challenge`. */
  challenge?: ChallengeData;
  /** `surface` — compose screen card; `overlay` — in-camera dark overlay. */
  presentation?: "surface" | "overlay";
  style?: ViewStyle;
};

export function FlowIntentHeader({
  variant,
  challenge,
  presentation = "surface",
  style,
}: Props) {
  const colors = useColors();
  const isOverlay = presentation === "overlay";

  useEffect(() => {
    if (variant === "interests") {
      recordInterestsTelemetry("interests_header_rendered");
    }
  }, [variant]);

  const label =
    variant === "challenge" ? "Today's theme" : INTERESTS_FLOW.label;
  const title =
    variant === "challenge"
      ? (challenge?.title ?? "Today's theme")
      : INTERESTS_FLOW.title;
  const description =
    variant === "challenge"
      ? (challenge?.description ?? "")
      : INTERESTS_FLOW.description;
  const emoji = variant === "challenge" ? challenge?.emoji : INTERESTS_FLOW.heroEmoji;

  const accessibilityLabel =
    variant === "challenge"
      ? `Today's theme: ${title}. ${description}`
      : `${INTERESTS_FLOW.label}. ${INTERESTS_FLOW.title} ${INTERESTS_FLOW.description}`;

  return (
    <View
      style={[
        styles.card,
        isOverlay ? styles.cardOverlay : styles.cardSurface,
        !isOverlay && {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={[
          styles.label,
          { color: isOverlay ? "rgba(255,255,255,0.72)" : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
      <View style={styles.titleRow}>
        {variant === "interests" ? (
          <Icon
            name="sparkles"
            size={22}
            color={isOverlay ? "#fff" : colors.foreground}
          />
        ) : (
          <Text style={styles.emoji}>{emoji}</Text>
        )}
        <Text
          style={[
            styles.title,
            { color: isOverlay ? "#fff" : colors.foreground },
          ]}
        >
          {title}
        </Text>
      </View>
      {description ? (
        <Text
          style={[
            styles.description,
            { color: isOverlay ? "rgba(255,255,255,0.78)" : colors.mutedForeground },
          ]}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  cardSurface: {
    borderWidth: 1,
  },
  cardOverlay: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  emoji: { fontSize: 22 },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    flex: 1,
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginTop: 2,
  },
});
