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
            dialogTitle: "Share this echo",
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
      <Text style={[styles.headerTitle, { color: colors.foreground }]}>
        same same
      </Text>
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
            This echo isn't available right now.
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
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.shareTitle, { color: colors.foreground }]}>
              same same
            </Text>

            <View style={styles.shareChipsRow}>
              {sameChips.map((chip) => (
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

            <View style={styles.sharePhotoPair}>
              <View style={styles.sharePhotoSlot}>
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
              <View style={styles.sharePhotoSlot}>
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

            {!proUnlocked && (
              <View
                style={[
                  styles.watermark,
                  {
                    backgroundColor: colors.primary + "26",
                    borderColor: colors.primary + "55",
                  },
                ]}
              >
                <Text style={styles.watermarkSparkle}>✨</Text>
                <Text style={[styles.watermarkText, { color: colors.primary }]}>
                  echo · same same
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
            {sharing ? "Preparing…" : "Share this echo"}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Two strangers, same vibe.
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
  shareCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 18,
    gap: 16,
    overflow: "hidden",
    alignItems: "center",
  },
  shareTitle: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    textTransform: "lowercase",
  },
  shareChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  shareChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  shareChipEmoji: { fontSize: 14 },
  shareChipText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
    textTransform: "lowercase",
  },
  sharePhotoPair: {
    flexDirection: "row",
    gap: 10,
    alignSelf: "stretch",
  },
  sharePhotoSlot: {
    flex: 1,
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
  shareFlagBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shareFlagText: {
    fontSize: 20,
    lineHeight: 22,
  },
  watermark: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  watermarkSparkle: { fontSize: 12 },
  watermarkText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
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
