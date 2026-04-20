import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { isSamplePhoto } from "@/data/samplePhotos";

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
}

export function PhotoCard({ uri, size = "md", style, showSampleBadge }: Props) {
  const colors = useColors();

  const dimensions = {
    sm: { width: 100, height: 100, borderRadius: 12 },
    md: { width: 160, height: 160, borderRadius: 16 },
    lg: { width: "100%", height: 240, borderRadius: 20 },
  }[size];

  // Auto-detect sample photos so the badge appears anywhere we render one
  // — no callsite needs to know. Authors can still override per-instance.
  const showBadge = showSampleBadge ?? isSamplePhoto(uri);
  const badgeSize = size === "sm" ? 18 : size === "md" ? 22 : 26;
  const iconSize = size === "sm" ? 10 : size === "md" ? 12 : 14;
  const badgeOffset = size === "sm" ? 4 : 6;

  return (
    <View
      style={[
        styles.container,
        {
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: dimensions.borderRadius,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
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
      {showBadge && (
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
    borderWidth: 1,
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
});
