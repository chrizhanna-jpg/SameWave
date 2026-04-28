import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import ViewShot, { captureRef } from "react-native-view-shot";
import { Icon } from "@/components/Icon";
import { MicBadge } from "@/components/MicBadge";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getTimeTier, getGeoTier } from "@/utils/celebrations";
import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { fetchPair, type PhotoPairResult } from "@/utils/api";
import { pausePreview } from "@/utils/audio";

export default function EchoPairScreen() {
  const colors = useColors();
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
  const shotRef = useRef<ViewShot>(null);

  // Subtle entrance animation so the share card "lands" rather than
  // popping in cold. Mirrors the reveal screen's feel.
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scaleIn = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!params.a || !params.b) {
        setLoading(false);
        return;
      }
      const result = await fetchPair(String(params.a), String(params.b));
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
      const uri = await captureRef(shotRef.current, {
        format: "jpg",
        quality: 0.95,
        result: "tmpfile",
      });
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

  const sameChips: Array<{ label: string; emoji: string }> = [
    { label: themeTitle, emoji: themeEmoji },
  ];
  const timeChipMap: Record<string, { label: string; emoji: string } | null> = {
    minute: { label: "same minute", emoji: "⚡" },
    hour: { label: "same hour", emoji: "✨" },
    day: { label: "same day", emoji: "☀️" },
    week: { label: "same week", emoji: "🗓️" },
    distant: null,
  };
  const timeChip = timeChipMap[timeTier.kind];
  if (timeChip) sameChips.push(timeChip);
  const geoChipMap: Record<string, { label: string; emoji: string }> = {
    country: { label: "same country", emoji: "📍" },
    continent: { label: "same continent", emoji: "🌎" },
    planet: { label: "same world", emoji: "🌍" },
  };
  sameChips.push(geoChipMap[geoTier.kind]);

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
        <Animated.View
          style={{
            opacity: fadeIn,
            transform: [{ scale: scaleIn }],
          }}
        >
          <ViewShot
            ref={shotRef}
            options={{ format: "jpg", quality: 0.95 }}
            style={[
              styles.shareCard,
              {
                backgroundColor: colors.card,
                // Celebration accent: a soft gold edge frames the
                // whole shareable so it reads as a milestone moment,
                // not just a regular pair view.
                borderColor: colors.gold + "66",
                borderWidth: 1.5,
              },
            ]}
          >
            {/* Decorative sparkle confetti in the corners of the
                share image — small enough to feel like flourish, not
                clutter, and burned into the captured image so the
                shared moment feels celebratory at a glance. */}
            <Text style={styles.cornerSparkleTL}>✨</Text>
            <Text style={styles.cornerSparkleTR}>✨</Text>
            <Text style={styles.cornerSparkleBL}>✨</Text>
            <Text style={styles.cornerSparkleBR}>✨</Text>

            {/* Hero brand mark — the Wave (mutual) share card title
                renders as [wave-icon] Wave [wave-icon], mirroring the
                Ripple card's [ripple-icon] Ripple [ripple-icon] layout
                but with the wave glyph and teal accent color so the
                two share cards remain visually distinct. */}
            <View style={styles.shareTitleRow}>
              <Icon name="wave-glyph" size={22} color={colors.teal} />
              <Text style={[styles.shareTitle, { color: colors.teal }]}>
                Wave
              </Text>
              <Icon name="wave-glyph" size={22} color={colors.teal} />
            </View>

            {/* Two-row chip layout: the topic (first chip) sits alone
                on its own centered line, then the time + geo "same X"
                tokens share a second line below. Mirrors the Ripple
                share card on reveal.tsx so the two share cards stay
                visually consistent. */}
            {(() => {
              const [topicChip, ...metaChips] = sameChips;
              return (
                <>
                  <View style={styles.shareChipsRow}>
                    <View
                      key={topicChip.label}
                      style={[
                        styles.shareChip,
                        {
                          backgroundColor: colors.teal + "1a",
                          borderColor: colors.teal + "55",
                        },
                      ]}
                    >
                      <Text style={styles.shareChipEmoji}>{topicChip.emoji}</Text>
                      <Text style={[styles.shareChipText, { color: colors.teal }]}>
                        {topicChip.label}
                      </Text>
                    </View>
                  </View>
                  {metaChips.length > 0 && (
                    <View style={styles.shareChipsRow}>
                      {metaChips.map((chip) => (
                        <View
                          key={chip.label}
                          style={[
                            styles.shareChip,
                            {
                              backgroundColor: colors.teal + "1a",
                              borderColor: colors.teal + "55",
                            },
                          ]}
                        >
                          <Text style={styles.shareChipEmoji}>{chip.emoji}</Text>
                          <Text style={[styles.shareChipText, { color: colors.teal }]}>
                            {chip.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              );
            })()}

            {/* The photo pair now breaks out of the share-card's horizontal
                padding (via negative margin) so the two images run almost
                edge-to-edge of the captured share image. Country flags
                used to be absolutely-positioned overlays on the top-right
                of each photo — they now live in a small row directly
                beneath their photo, centered, same 36px size. The mic-
                badge audio indicator stays inside the photo frame
                (Echo-only). */}
            {/* Photo layout has two modes:
                  free  → side-by-side (same as before): two photos in
                          a row sharing the card width, two flags in a
                          row beneath, plus the "Find it on Google
                          Play" watermark below the card.
                  Pro   → stacked: each photo takes the full card-edge-
                          to-card-edge width with a small flag
                          centered directly beneath it. With the
                          watermark removed (Pro perk), there's
                          nothing competing for vertical space, so
                          the photos can grow as big as the share
                          card allows — matching the match-screen
                          presentation the user asked for. The mic
                          badge stays inside the photo frame in both
                          modes (Echo-only audio indicator). */}
            {proUnlocked ? (
              <View style={styles.sharePhotoStack}>
                <View style={styles.sharePhotoStackItem}>
                  <View style={styles.sharePhotoFrameStacked}>
                    <Image
                      source={{ uri: pair.a.uri }}
                      style={styles.sharePhoto}
                      resizeMode="cover"
                    />
                    {pair.a.customAudioUrl ? (
                      <View style={styles.micBadgeOverlay}>
                        <MicBadge audioUrl={pair.a.customAudioUrl} size="sm" />
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.shareFlagBadge,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Text style={styles.shareFlagText}>
                      {pair.a.countryFlag ?? "🌍"}
                    </Text>
                  </View>
                </View>
                <View style={styles.sharePhotoStackItem}>
                  <View style={styles.sharePhotoFrameStacked}>
                    <Image
                      source={{ uri: pair.b.uri }}
                      style={styles.sharePhoto}
                      resizeMode="cover"
                    />
                    {pair.b.customAudioUrl ? (
                      <View style={styles.micBadgeOverlay}>
                        <MicBadge audioUrl={pair.b.customAudioUrl} size="sm" />
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.shareFlagBadge,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Text style={styles.shareFlagText}>
                      {pair.b.countryFlag ?? "🌍"}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.sharePhotoPair}>
                <View style={styles.sharePhotoFramesRow}>
                  {/* Watermark used to be burned onto the photos here
                      as a small "✨ same same" pill at the bottom of
                      the photo row. User feedback: it cluttered the
                      photos and felt too small to read as an actual
                      watermark. The watermark now lives only as the
                      larger pill below the flag row (see
                      styles.watermark) — clearer, brand-y, and out
                      of the photo composition. */}
                  <View style={styles.sharePhotoFrame}>
                    <Image
                      source={{ uri: pair.a.uri }}
                      style={styles.sharePhoto}
                      resizeMode="cover"
                    />
                    {pair.a.customAudioUrl ? (
                      <View style={styles.micBadgeOverlay}>
                        <MicBadge audioUrl={pair.a.customAudioUrl} size="sm" />
                      </View>
                    ) : null}
                    <View style={styles.photoOverlayWatermarkContainer}>
                      <View style={styles.photoOverlayWatermark}>
                        <Icon name="wave" size={11} color="#FFFFFF" />
                        <Text style={styles.photoOverlayWatermarkText}>SameWave</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.sharePhotoFrame}>
                    <Image
                      source={{ uri: pair.b.uri }}
                      style={styles.sharePhoto}
                      resizeMode="cover"
                    />
                    {pair.b.customAudioUrl ? (
                      <View style={styles.micBadgeOverlay}>
                        <MicBadge audioUrl={pair.b.customAudioUrl} size="sm" />
                      </View>
                    ) : null}
                    <View style={styles.photoOverlayWatermarkContainer}>
                      <View style={styles.photoOverlayWatermark}>
                        <Icon name="wave" size={11} color="#FFFFFF" />
                        <Text style={styles.photoOverlayWatermarkText}>SameWave</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.shareFlagRow}>
                  <View style={styles.shareFlagSlot}>
                    <View
                      style={[
                        styles.shareFlagBadge,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.shareFlagText}>
                        {pair.a.countryFlag ?? "🌍"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.shareFlagSlot}>
                    <View
                      style={[
                        styles.shareFlagBadge,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.shareFlagText}>
                        {pair.b.countryFlag ?? "🌍"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {!proUnlocked && (
              <View
                style={[
                  styles.watermark,
                  {
                    // Two-line attribution callout: app name on top so
                    // viewers know what app made the image, "Find it
                    // on Google Play" beneath so they know where to
                    // get it. Solid black with a teal brand outline
                    // is legible on any background. Sits inside the
                    // ViewShot capture region so it's burned into the
                    // exported share image.
                    backgroundColor: "#000000",
                    borderColor: colors.teal,
                  },
                ]}
              >
                <View style={styles.watermarkRow}>
                  <Icon name="wave" size={28} color="#FFFFFF" />
                  <Text style={[styles.watermarkText, { color: "#FFFFFF" }]}>
                    SameWave
                  </Text>
                </View>
                <Text style={[styles.watermarkSubtext, { color: colors.teal }]}>
                  Find it on Google Play
                </Text>
              </View>
            )}
          </ViewShot>
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
  shareCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
    gap: 10,
    overflow: "hidden",
    alignItems: "center",
  },
  shareTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  shareTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
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
  sharePhotoStack: {
    flexDirection: "column",
    gap: 14,
    alignSelf: "stretch",
    marginHorizontal: -18,
  },
  sharePhotoStackItem: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 6,
  },
  sharePhotoFrameStacked: {
    alignSelf: "stretch",
    // Landscape 4:3 (matches reveal.tsx). Earlier this was 4:5 portrait
    // at full card width which made each photo ~450 px tall — two
    // stacked + the header / chips / flags couldn't fit in a single
    // viewport, so the user could only see one photo on screen at a
    // time. 4:3 keeps the photos clearly bigger than free's
    // side-by-side framing while letting the whole share card fit in
    // a phone viewport for preview and a typical social-share crop.
    aspectRatio: 4 / 3,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
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
    flexDirection: "column",
    gap: 8,
    alignSelf: "stretch",
    marginHorizontal: -18,
  },
  sharePhotoFramesRow: {
    flexDirection: "row",
    gap: 6,
    alignSelf: "stretch",
    position: "relative",
  },
  sharePhotoFrame: {
    flex: 1,
    // Portrait 4:5. Each photo column is roughly half the card
    // width, so this gives a tall, magazine-like frame that
    // dominates the captured image — the title/chips above and the
    // flags/watermark below collapse into a thin top and bottom
    // strip around two big photos.
    aspectRatio: 4 / 5,
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
    gap: 6,
    alignSelf: "stretch",
  },
  shareFlagSlot: {
    flex: 1,
    alignItems: "center",
  },
  shareFlagBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shareFlagText: {
    fontSize: 16,
    lineHeight: 18,
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
