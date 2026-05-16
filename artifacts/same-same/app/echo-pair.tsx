import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { Icon } from "@/components/Icon";
import { MicBadge } from "@/components/MicBadge";
import { ConnectionAtlasShareCard } from "@/components/ConnectionAtlasShareCard";
import { SharePhotoCardPoster } from "@/components/SharePhotoCardPoster";
import {
  ShareLayoutModeToggle,
  type ShareLayoutMode,
} from "@/components/ShareLayoutModeToggle";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getTimeTier, getGeoTier } from "@/utils/celebrations";
import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { fetchPair, type PhotoPairResult } from "@/utils/api";
import { pausePreview } from "@/utils/audio";
import {
  shareCaptureOptions,
  sharePreviewWidth,
  shareShotFrameStyle,
} from "@/utils/shareDimensions";

export default function EchoPairScreen() {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const shareCardWidth = sharePreviewWidth(windowWidth);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const { proUnlocked } = useApp();

  // Pause any voice-clip preview the user kicked off via a mic badge
  // tap when they navigate away. `pausePreview()` is lease-aware and
  // no-ops if some other screen has since taken over playback, so it
  // won't disturb unrelated background audio.
  useFocusEffect(
    useCallback(() => {
      return () => {
        void pausePreview();
      };
    }, []),
  );

  const [pair, setPair] = useState<PhotoPairResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shareLayoutMode, setShareLayoutMode] = useState<ShareLayoutMode>("card");
  const shotRef = useRef<View>(null);

  // Subtle entrance animation so the share card "lands" rather than
  // popping in cold. Mirrors the reveal screen's feel.
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scaleIn = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (shareLayoutMode !== "atlas") return;
    fadeIn.setValue(1);
    scaleIn.setValue(1);
  }, [shareLayoutMode, fadeIn, scaleIn]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const photoA = Array.isArray(params.a) ? params.a[0] : params.a;
      const photoB = Array.isArray(params.b) ? params.b[0] : params.b;
      if (!photoA || !photoB) {
        setLoading(false);
        return;
      }
      const result = await fetchPair(String(photoA), String(photoB));
      if (alive) {
        setPair(result);
        setLoading(false);
        if (result) {
          Animated.parallel([
            Animated.timing(fadeIn, {
              toValue: 1,
              duration: 320,
              useNativeDriver: true,
            }),
            Animated.spring(scaleIn, {
              toValue: 1,
              friction: 7,
              tension: 50,
              useNativeDriver: true,
            }),
          ]).start();
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.a, params.b]);

  const handleShare = async () => {
    if (sharing || !pair || !shotRef.current) return;
    setSharing(true);
    try {
      if (shareLayoutMode === "atlas") {
        await new Promise((resolve) => setTimeout(resolve, 320));
      }
      const uri = await captureRef(shotRef.current, shareCaptureOptions());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (Platform.OS === "web") {
        Alert.alert(
          "Share ready",
          "On the published mobile app, this opens your phone's share sheet (Instagram, WhatsApp, Messages, etc.).",
        );
      } else {
        const available = await Sharing.isAvailableAsync();
        if (!available) {
          Alert.alert(
            "Sharing unavailable",
            "Sharing isn't supported on this device.",
          );
        } else {
          await Sharing.shareAsync(uri, {
            mimeType: "image/jpeg",
            dialogTitle: "Share this wave",
          });
        }
      }
    } catch {
      Alert.alert(
        "Couldn't share",
        "Something went wrong creating the share image.",
      );
    } finally {
      setSharing(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  // The header still gets rendered while loading / on the empty state, so
  // we hoist it. The chip + share-card construction below only runs once
  // we have a valid pair, so the helpers can safely assume `pair` exists.
  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: topPadding }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={[styles.iconBtn, { borderColor: colors.border }]}
        hitSlop={8}
        accessibilityLabel="Close"
      >
        <Icon name="x" size={20} color={colors.foreground} />
      </TouchableOpacity>
      {/* Header title intentionally blank — the Wave wordmark with its
          two icons lives on the share card itself; duplicating it in
          the screen header read as repetition. The flex spacer keeps
          the close + share buttons pinned to the edges. */}
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        onPress={handleShare}
        disabled={!pair || sharing}
        style={[
          styles.iconBtn,
          { borderColor: colors.border, opacity: pair ? 1 : 0.4 },
        ]}
        hitSlop={8}
        accessibilityLabel="Share"
      >
        <Icon name="share" size={18} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!pair) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={styles.center}>
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            This wave isn't available right now.
          </Text>
        </View>
      </View>
    );
  }

  // ── Chip helpers (mirrors /reveal) ────────────────────────────────────
  // Resolve the matched theme to its display title + emoji. Either side's
  // `theme` field is the same value; we prefer `a.theme` and fall back to
  // `b.theme` so a missing field on one side doesn't blank out the chip.
  const rawTheme = pair.a.theme || pair.b.theme || "the same thing";
  const themeMeta = DAILY_CHALLENGES.find(
    (c) => c.id === rawTheme || c.title.toLowerCase() === rawTheme,
  );
  const themeTitle = themeMeta?.title ?? rawTheme;
  const themeEmoji = themeMeta?.emoji ?? "✨";

  // Time tier reuses the shared celebrations helper. We feed it `a` as
  // "mine" and convert `b.createdAt` into minutes-ago so the diff math is
  // the same as the match flow. If either timestamp is missing we get a
  // "distant" tier back, which we then drop from the chip row.
  const bMinutesAgo =
    pair.b.createdAt != null
      ? (Date.now() - new Date(pair.b.createdAt).getTime()) / 60000
      : undefined;
  const timeTier = getTimeTier(pair.a.createdAt ?? undefined, bMinutesAgo);
  const geoTier = getGeoTier(
    pair.a.countryCode ?? undefined,
    pair.b.countryCode ?? undefined,
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* The shareable card. ONLY the contents of <ViewShot> are
            captured by handleShare and exported as the social-media
            image, so any extra context / buttons sit OUTSIDE this block.
            Same structure as /reveal: "same same" wordmark, "same X"
            chip row with the actual vibe name first, two photos with a
            flag beside each, then the watermark when not Pro. */}
        <ShareLayoutModeToggle
          value={shareLayoutMode}
          onChange={setShareLayoutMode}
        />

        <Text style={[styles.sharePreviewCaption, { color: colors.mutedForeground }]}>
          Preview · exports as 1080×1080
        </Text>

        <Animated.View
          style={[
            { opacity: fadeIn },
            ...(shareLayoutMode !== "atlas"
              ? [{ transform: [{ scale: scaleIn }] }]
              : []),
          ]}
        >
          <View
            ref={shotRef}
            collapsable={false}
            style={[
              shareShotFrameStyle(shareCardWidth),
              shareLayoutMode === "atlas" && styles.shareAtlasShot,
              shareLayoutMode === "card" && styles.shareShotClip,
            ]}
          >
          {shareLayoutMode === "atlas" ? (
            <ConnectionAtlasShareCard
              kind="wave"
              fromCode={pair.a.countryCode}
              toCode={pair.b.countryCode}
              myPhotoUri={pair.a.uri}
              theirPhotoUri={pair.b.uri}
              myCountryFlag={pair.a.countryFlag}
              theirCountryFlag={pair.b.countryFlag}
              themeTitle={themeTitle}
              themeEmoji={themeEmoji}
              timeTier={timeTier}
              geoTier={geoTier}
              showWatermark={!proUnlocked}
              width={shareCardWidth}
            />
          ) : (
            <SharePhotoCardPoster
              variant="wave"
              side={shareCardWidth}
              themeTitle={themeTitle}
              themeEmoji={themeEmoji}
              timeTier={timeTier}
              geoTier={geoTier}
              myPhotoUri={pair.a.uri}
              theirPhotoUri={pair.b.uri}
              myCountryFlag={pair.a.countryFlag}
              myCountryName={pair.a.country}
              theirCountry={pair.b.country}
              theirCountryFlag={pair.b.countryFlag}
              showWatermark={!proUnlocked}
              highlightBothCountries
              renderPhotoOverlay={(slot) => {
                const photo = slot === "mine" ? pair.a : pair.b;
                if (!photo.customAudioUrl) return null;
                return <MicBadge audioUrl={photo.customAudioUrl} size="sm" />;
              }}
            />
          )}
          </View>
        </Animated.View>

        {/* Visual separator between the shareable image above and the
            interactive controls below. Makes it obvious which part of
            the screen ends up in the exported share image. */}
        <View style={styles.sectionDivider}>
          <View
            style={[
              styles.sectionDividerLine,
              { backgroundColor: colors.border },
            ]}
          />
          <Text
            style={[
              styles.sectionDividerLabel,
              { color: colors.mutedForeground },
            ]}
          >
            actions
          </Text>
          <View
            style={[
              styles.sectionDividerLine,
              { backgroundColor: colors.border },
            ]}
          />
        </View>

        <TouchableOpacity
          onPress={handleShare}
          disabled={sharing}
          style={[
            styles.shareBtn,
            {
              backgroundColor: colors.primary,
              opacity: sharing ? 0.7 : 1,
            },
          ]}
          activeOpacity={0.85}
        >
          <Icon name="share" size={18} color={colors.primaryForeground} />
          <Text
            style={[styles.shareBtnText, { color: colors.primaryForeground }]}
          >
            {sharing ? "Preparing…" : "Share this wave"}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Where minds meet
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  scroll: { flex: 1 },
  body: {
    paddingHorizontal: 20,
    gap: 18,
    flexGrow: 1,
  },
  // Layout deliberately favours the two photos: tight outer padding,
  // tight stack gap, compact title + chips above, and a portrait
  // (4:5) aspect ratio on each photo so the imagery dominates the
  // captured share card.
  sharePreviewCaption: {
    alignSelf: "center",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    marginTop: -6,
    marginBottom: 2,
  },
  shareCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    overflow: "hidden",
    alignItems: "center",
  },
  shareCardCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 5,
  },
  shareCardSquare: {
    flex: 1,
    justifyContent: "space-between",
    height: "100%",
  },
  shareTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shareAtlasShot: {
    borderRadius: 24,
    overflow: "hidden",
  },
  shareShotClip: {
    overflow: "hidden",
  },
  shareTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  shareTitleCompact: {
    fontSize: 17,
  },
  // Tiny gold sparkles tucked into the four corners of the share
  // card. Absolute-positioned so they don't disturb the centered
  // photo-first layout, and burned into the captured image.
  cornerSparkleTL: {
    position: "absolute",
    top: 6,
    left: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  cornerSparkleTR: {
    position: "absolute",
    top: 6,
    right: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  cornerSparkleBL: {
    position: "absolute",
    bottom: 6,
    left: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  cornerSparkleBR: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  shareChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  // Pro-only stacked photo layout. Mirrors the same shape used on
  // reveal.tsx — each photo+flag pair sits in its own column item;
  // the outer stack adds vertical breathing space between the two
  // pairs (larger than the within-pair gap so each photo reads as
  // visually paired with its own flag, not the next photo). Same
  // edge-to-edge break-out as sharePhotoPair so the photos run
  // flush with the share-card edges.
  shareChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  shareChipEmoji: { fontSize: 12 },
  shareChipText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
    textTransform: "lowercase",
  },
  // The pair container holds the photo row and the flag row stacked
  // vertically. We pull it edge-to-edge of the share card via a negative
  // horizontal margin equal to the share card's horizontal padding (18),
  // so the captured share image's photos run almost to the corners.
  sharePhotoPair: {
    flex: 1,
    flexDirection: "column",
    gap: 4,
    alignSelf: "stretch",
    justifyContent: "center",
    marginHorizontal: -10,
    minHeight: 0,
  },
  sharePhotoFramesRow: {
    flexDirection: "row",
    gap: 6,
    alignSelf: "stretch",
    position: "relative",
  },
  sharePhotoFrame: {
    flex: 1,
    // Square side-by-side frames — shorter card for social story size.
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  sharePhoto: {
    width: "100%",
    height: "100%",
  },
  micBadgeOverlay: { position: "absolute", bottom: 8, left: 8 },
  // Flags now sit in a row below the photos, one per photo, centered in
  // their column. Same 36px diameter as the old absolute overlay.
  shareFlagRow: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "stretch",
    marginTop: 2,
  },
  // Two-line attribution callout. The outer container stacks the
  // wordmark row above the "Find it on Google Play" subtitle, with
  // both lines centered. Bigger padding + bolder border so the pill
  // reads as an intentional "made with X" credit, not a stray UI
  // element.
  watermark: {
    alignSelf: "center",
    flexDirection: "column",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  watermarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  watermarkSparkle: { fontSize: 14 },
  watermarkText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  watermarkSubtext: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  // Burned-in watermark overlaid on the photo pair. Centered along the
  // bottom of the pair using a stretched container; the inner pill auto-
  // sizes to its content so the wordmark is readable but unobtrusive.
  photoOverlayWatermarkContainer: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  photoOverlayWatermark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  photoOverlayWatermarkSparkle: {
    fontSize: 11,
    color: "#FFFFFF",
  },
  photoOverlayWatermarkText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.4,
    textTransform: "lowercase",
  },
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
  },
  sectionDividerLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  shareBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  footer: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
});
