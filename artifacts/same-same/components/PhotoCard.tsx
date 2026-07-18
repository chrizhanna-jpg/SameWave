import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { Icon } from "@/components/Icon";
import { MicBadge } from "@/components/MicBadge";
import { useColors } from "@/hooks/useColors";
import { StockPhotoWatermark } from "@/components/StockPhotoWatermark";
import { MatchPhotoDevOverlay } from "@/components/MatchPhotoDevOverlay";
import { isSamplePhoto } from "@/data/samplePhotos";
import { AiGeneratedBadge } from "@/components/AiGeneratedBadge";
import { isAiPhoto } from "@/context/AppContext";

interface Props {
  uri: string;
  /** Durable fallback when the primary uri fails (e.g. purged file://). */
  fallbackUri?: string;
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
  /**
   * URL of the user's own voice clip attached to this photo. When set we
   * render a tappable mic badge in the bottom-left corner that previews
   * the clip — this is how users see/hear that a past photo carries
   * their recording.
   */
  audioUrl?: string;
  /** Expo-only: show sample id + theme on curated stock thumbnails. */
  devCandidateId?: string | null;
  devTheme?: string | null;
  devMatchedTheme?: string | null;
  /** Viewer-owned slot — never show stock/Unsplash fallbacks. */
  viewerOwnPhoto?: boolean;
  /**
   * When false, the mic badge is non-interactive — useful when an outer
   * row already owns the tap and calls `togglePreview()` itself.
   * Defaults to true.
   */
  audioInteractive?: boolean;
}

export function PhotoCard({
  uri,
  fallbackUri,
  size = "md",
  style,
  showSampleBadge,
  showAiBadge,
  audioUrl,
  audioInteractive = true,
  devCandidateId,
  devTheme,
  devMatchedTheme,
  viewerOwnPhoto = false,
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
  const showSample =
    !viewerOwnPhoto && (showSampleBadge ?? isSamplePhoto(uri)) && !isAi;
  const badgeOffset = size === "sm" ? 4 : 6;
  const stockMarkSize: "sm" | "md" | "lg" | "xl" =
    size === "sm" ? "md" : size === "md" ? "lg" : "xl";
  const aiBadgeSize: "sm" | "md" | "lg" =
    size === "sm" ? "sm" : size === "md" ? "md" : "lg";

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
      <RemotePhotoImage
        uri={uri}
        fallbackUri={fallbackUri}
        style={[
          styles.image,
          { borderRadius: dimensions.borderRadius },
        ]}
        resizeMode="cover"
        viewerOwnPhoto={viewerOwnPhoto}
      />
      {isAi ? <AiGeneratedBadge size={aiBadgeSize} /> : null}
      {showSample && (
        <StockPhotoWatermark
          size={stockMarkSize}
          style={{ top: badgeOffset, left: badgeOffset }}
        />
      )}
      <MatchPhotoDevOverlay
        uri={uri}
        candidateId={devCandidateId}
        theme={devTheme}
        matchedTheme={devMatchedTheme}
        style={{ top: badgeOffset + (showSample ? 28 : 0) }}
      />
      {audioUrl ? (
        <MicBadge
          audioUrl={audioUrl}
          size={size === "sm" ? "xs" : size === "md" ? "sm" : "md"}
          interactive={audioInteractive}
          style={[
            styles.micBadge,
            { left: badgeOffset, bottom: badgeOffset },
          ]}
        />
      ) : null}
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
  micBadge: {
    position: "absolute",
  },
});
