import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { isSamplePhoto } from "@/data/samplePhotos";
import { isAiPhoto } from "@/context/AppContext";

interface Props {
  uri: string;
  size?: "sm" | "md" | "lg";
  style?: object;
  /**
   * Force the small "sample" globe badge on or off. By default the badge
   * appears automatically when the URI is one of the curated sample photos
   * — pass `false` to suppress it (e.g. for a tightly-cropped thumbnail
   * inside an avatar) or `true` to show it for synthetic candidates.
   */
  showSampleBadge?: boolean;
  /**
   * Force the "AI" badge on or off. By default the badge appears
   * automatically when the URI matches a user photo flagged as
   * AI-generated. Pass `false` to suppress.
   */
  showAiBadge?: boolean;
}

export function PhotoCard({
  uri,
  size = "md",
  style,
  showSampleBadge,
  showAiBadge,
}: Props) {
  const colors = useColors();

  const dimensions = {
    sm: { width: 100, height: 100, borderRadius: 14 },
    md: { width: 160, height: 160, borderRadius: 20 },
    lg: { width: "100%", height: 240, borderRadius: 24 },
  }[size];

  // Auto-detect sample + AI photos so the badges appear anywhere we render
  // them — no callsite needs to know. AI badge takes precedence (more
  // important provenance signal than "this is a curated sample").
  const isAi = showAiBadge ?? isAiPhoto(uri);
  const showSample = (showSampleBadge ?? isSamplePhoto(uri)) && !isAi;
  const badgeSize = size === "sm" ? 20 : size === "md" ? 24 : 28;
  const iconSize = size === "sm" ? 10 : size === "md" ? 12 : 14;
  const badgeOffset = size === "sm" ? 4 : 6;
  const aiFontSize = size === "sm" ? 9 : size === "md" ? 10 : 12;

  return (
    <View
      style={[
        styles.container,
        {
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: dimensions.borderRadius,
          backgroundColor: colors.card,
        },
        colors.shadows.sm,
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={[
          styles.image,
          { borderRadius: dimensions.borderRadius },
        ]}
        resizeMode="cover"
      />
      {isAi && (
        <View
          style={[
            styles.aiBadge,
            {
              height: badgeSize,
              borderRadius: badgeSize / 2,
              top: badgeOffset,
              right: badgeOffset,
              paddingHorizontal: badgeSize / 2.5,
              backgroundColor: colors.primary,
            },
          ]}
          accessibilityLabel="AI-generated photo"
        >
          <Text
            style={{
              color: colors.primaryForeground,
              fontSize: aiFontSize,
              fontFamily: "Inter_700Bold",
              letterSpacing: 0.5,
            }}
          >
            AI
          </Text>
        </View>
      )}
      {showSample && (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              top: badgeOffset,
              right: badgeOffset,
              backgroundColor: "rgba(0, 0, 0, 0.55)",
            },
          ]}
          accessibilityLabel="Sample photo"
        >
          <Icon name="globe" size={iconSize} color="#ffffff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  badge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  aiBadge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
