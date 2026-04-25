import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import ViewShot, { captureRef } from "react-native-view-shot";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { CountryReveal } from "@/components/CountryReveal";
import { ConnectSheet } from "@/components/ConnectSheet";
import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import { getTimeTier, getGeoTier } from "@/utils/celebrations";
import { commonInterests, tagEmoji, tagLabel } from "@/utils/interests";
import type { Match } from "@/context/AppContext";

const { width } = Dimensions.get("window");

export default function RevealScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const {
    matchedCountries,
    proUnlocked,
    unlockPro,
    sendConnectRequest,
    hasOutgoingForMatch,
    myDefaultPlatform,
    myDefaultHandle,
    myVibe,
    myCountryCode,
    myCountryFlag,
  } = useApp();
  const [match, setMatch] = useState<Match | null>(null);
  const [sharing, setSharing] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectSent, setConnectSent] = useState(false);
  const savedRef = useRef(false);
  const shotRef = useRef<ViewShot>(null);
  // The `action` param lets callers (MatchFlash, match-history) jump
  // straight to "Share" or open the remove-watermark paywall on mount,
  // skipping the extra tap. Guarded by a ref so a re-render of the
  // same screen doesn't re-fire the side-effect.
  const actionFiredRef = useRef(false);

  const handleShare = async () => {
    if (sharing || !shotRef.current) return;
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
          Alert.alert("Sharing unavailable", "Sharing isn't supported on this device.");
        } else {
          await Sharing.shareAsync(uri, {
            mimeType: "image/jpeg",
            dialogTitle: "Share your Echo",
          });
        }
      }
    } catch (err) {
      Alert.alert("Couldn't share", "Something went wrong creating the share image.");
    } finally {
      setSharing(false);
    }
  };

  const handleUnlock = () => {
    // Stub paywall — real billing (RevenueCat or platform IAP) wires in
    // at publish time. For now this flips the local pro flag.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    unlockPro();
    setPaywallOpen(false);
  };

  const fadeIn = useRef(new Animated.Value(0)).current;
  const scaleIn = useRef(new Animated.Value(0.92)).current;
  const sparklePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (params.matchData) {
      try {
        const m = JSON.parse(params.matchData as string) as Match;
        setMatch(m);

        // The match is already persisted by the swipe handler in match.tsx
        // before navigating here — calling addMatch again would create a
        // duplicate row with the same id (React duplicate-key warning).
        savedRef.current = true;

        Animated.parallel([
          Animated.timing(fadeIn, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(scaleIn, {
            toValue: 1,
            tension: 80,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();

        Animated.loop(
          Animated.sequence([
            Animated.timing(sparklePulse, {
              toValue: 1,
              duration: 1100,
              useNativeDriver: true,
            }),
            Animated.timing(sparklePulse, {
              toValue: 0,
              duration: 1100,
              useNativeDriver: true,
            }),
          ])
        ).start();

        setTimeout(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }, 400);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.matchData]);

  // Auto-fire the requested deep-link action once the match has loaded
  // and the share-card has had a tick to lay out (otherwise captureRef
  // grabs an empty frame). Fires at most once per mount.
  useEffect(() => {
    if (!match || actionFiredRef.current) return;
    const action = (params.action as string | undefined) ?? "";
    if (action !== "share" && action !== "paywall") return;
    actionFiredRef.current = true;
    const t = setTimeout(() => {
      if (action === "share") {
        handleShare();
      } else if (action === "paywall") {
        if (!proUnlocked) setPaywallOpen(true);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, params.action]);

  const handleNext = () => {
    router.back();
  };

  const handleConnectSubmit = (platform: string, handle: string) => {
    if (!match) return;
    const created = sendConnectRequest(match.id, platform, handle);
    setConnectOpen(false);
    if (created) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConnectSent(true);
    }
  };

  if (!match) return null;

  const isNewCountry = !matchedCountries.some(
    (c) => c.code === match.theirCountryCode
  );

  // Tiered celebrations: closer in time = bigger deal.
  const timeTier = getTimeTier(match.myPhotoUploadedAt, match.theirPhotoMinutesAgo);
  // Geography tier — uses the user's chosen home country (set in onboarding
  // / profile). Falls back to "Same Planet" if they skipped picking one.
  const geoTier = getGeoTier(myCountryCode, match.theirCountryCode);
  const isCelebrated = timeTier.rank >= 1; // anything from week up

  const themeMeta = DAILY_CHALLENGES.find(
    (c) => c.id === match.theme || c.title.toLowerCase() === match.theme,
  );
  const themeTitle = themeMeta?.title ?? match.theme ?? "the same thing";
  const themeEmoji = themeMeta?.emoji ?? "✨";

  // The "same X" chips that summarise WHY this match happened. These ride
  // inside the shareable card so the social-media image makes immediate
  // sense to anyone who sees it without context. The first chip is the
  // matched vibe itself — we show the actual theme name (e.g. "sunset",
  // "morning coffee") rather than a generic "same vibe" label so the
  // share image tells the viewer exactly what the two strangers shared.
  // Then we add a time chip if the posts were close enough in time, and
  // a geo chip describing how close geographically.
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

  const sparkleScale = sparklePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  const sparkleOpacity = sparklePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={handleNext}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Icon name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          same same
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* The shareable card. ONLY the contents of <ViewShot> are captured
            in handleShare() and exported as the social-media image, so the
            buttons and any extra context live OUTSIDE this block. The card
            holds just four things: the "same same" wordmark, the row of
            "same X" chips that explain WHY the match happened, the two
            photos with a flag beside each, and the watermark when the user
            hasn't unlocked Pro. */}
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
            {/* Burned-in watermark overlaid on the photo pair so it
                cannot be cropped off — sits in the gap between the
                two photos near the bottom. Hidden once the user has
                unlocked Pro via the in-app upsell. */}
            {!proUnlocked ? (
              <View
                pointerEvents="none"
                style={styles.photoOverlayWatermarkContainer}
              >
                <View style={styles.photoOverlayWatermark}>
                  <Text style={styles.photoOverlayWatermarkSparkle}>✨</Text>
                  <Text style={styles.photoOverlayWatermarkText}>
                    same same
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.sharePhotoSlot}>
              <Image
                source={{ uri: match.myPhoto }}
                style={styles.sharePhoto}
                resizeMode="cover"
              />
              <View style={[styles.shareFlagBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={styles.shareFlagText}>{myCountryFlag ?? "🌍"}</Text>
              </View>
            </View>
            <View style={styles.sharePhotoSlot}>
              <Image
                source={{ uri: match.theirPhoto }}
                style={styles.sharePhoto}
                resizeMode="cover"
              />
              <View style={[styles.shareFlagBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={styles.shareFlagText}>{match.theirCountryFlag ?? "🌍"}</Text>
              </View>
            </View>
          </View>

          {!proUnlocked && (
            <View style={[styles.watermark, { backgroundColor: "rgba(0, 0, 0, 0.55)", borderColor: "rgba(255, 255, 255, 0.18)" }]}>
              <Text style={styles.watermarkSparkle}>✨</Text>
              <Text style={[styles.watermarkText, { color: "#FFFFFF" }]}>
                echo · same same
              </Text>
            </View>
          )}
        </ViewShot>
        </Animated.View>

        {/* Visual separator between the shareable image above and the
            interactive actions below. Makes it obvious which part of the
            screen ends up in the exported share image. */}
        <View style={styles.sectionDivider}>
          <View style={[styles.sectionDividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.sectionDividerLabel, { color: colors.mutedForeground }]}>
            actions
          </Text>
          <View style={[styles.sectionDividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Anonymous Connect Request CTA — viral hook: mystery reveal,
            48h timer, mutual disclosure brings both users back. */}
        {(() => {
          const alreadySent = hasOutgoingForMatch(match.id) || connectSent;
          return (
            <TouchableOpacity
              onPress={() => {
                if (alreadySent) {
                  router.push("/connections");
                } else {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setConnectOpen(true);
                }
              }}
              activeOpacity={0.88}
              style={[
                styles.connectCta,
                {
                  backgroundColor: alreadySent
                    ? colors.card
                    : colors.teal,
                  borderColor: alreadySent ? colors.teal : colors.teal,
                  borderWidth: alreadySent ? 1 : 0,
                },
              ]}
            >
              <View style={[styles.connectIconBubble, { backgroundColor: alreadySent ? colors.teal + "22" : "rgba(0,16,24,0.18)" }]}>
                <Icon
                  name={alreadySent ? "clock" : "eye-off"}
                  size={18}
                  color={alreadySent ? colors.teal : "#001018"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.connectTitle,
                    { color: alreadySent ? colors.teal : "#001018" },
                  ]}
                >
                  {alreadySent ? "Request sent · waiting" : "Reveal & Connect"}
                </Text>
                <Text
                  style={[
                    styles.connectSub,
                    {
                      color: alreadySent
                        ? colors.mutedForeground
                        : "rgba(0,16,24,0.7)",
                    },
                  ]}
                >
                  {alreadySent
                    ? "They have 48h to respond — we'll ping you. Tap to view."
                    : "Anonymously swap socials — only revealed if they accept."}
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={18}
                color={alreadySent ? colors.mutedForeground : "#001018"}
              />
            </TouchableOpacity>
          );
        })()}

        <View style={styles.shareRow}>
          <TouchableOpacity
            style={[
              styles.shareBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={handleShare}
            activeOpacity={0.85}
            disabled={sharing}
            accessibilityLabel="Share this match"
          >
            <Icon name="share" size={18} color={colors.foreground} />
            <Text style={[styles.shareBtnText, { color: colors.foreground }]}>
              {sharing ? "Preparing…" : "Share"}
            </Text>
          </TouchableOpacity>

          {!proUnlocked && (
            <TouchableOpacity
              style={[styles.upsellBtn, { borderColor: colors.gold }]}
              onPress={() => setPaywallOpen(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.upsellEmoji}>✨</Text>
              <Text style={[styles.upsellText, { color: colors.gold }]}>
                Remove watermark · £1
              </Text>
            </TouchableOpacity>
          )}

          {proUnlocked && (
            <View style={[styles.proBadge, { backgroundColor: colors.gold + "22", borderColor: colors.gold }]}>
              <Text style={styles.upsellEmoji}>✨</Text>
              <Text style={[styles.upsellText, { color: colors.gold }]}>
                Pro · no watermark
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={[styles.nextBtnText, { color: colors.primaryForeground }]}>
            Keep matching
          </Text>
          <Icon name="arrow-right" size={20} color={colors.primaryForeground} />
        </TouchableOpacity>
      </ScrollView>

      {/* Paywall modal */}
      <Modal
        visible={paywallOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPaywallOpen(false)}
      >
        <Pressable
          style={styles.paywallBackdrop}
          onPress={() => setPaywallOpen(false)}
        >
          <Pressable
            style={[styles.paywallCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <TouchableOpacity
              onPress={() => setPaywallOpen(false)}
              style={styles.paywallClose}
              accessibilityLabel="Close"
            >
              <Icon name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            <Text style={styles.paywallSparkle}>✨</Text>
            <Text style={[styles.paywallTitle, { color: colors.foreground }]}>
              Echo Pro
            </Text>
            <Text style={[styles.paywallPrice, { color: colors.gold }]}>
              £1 · one-time, lifetime
            </Text>

            <View style={styles.paywallFeatures}>
              <View style={styles.paywallFeature}>
                <Icon name="check" size={16} color={colors.teal} />
                <Text style={[styles.paywallFeatureText, { color: colors.foreground }]}>
                  Share without watermark
                </Text>
              </View>
              <View style={styles.paywallFeature}>
                <Icon name="check" size={16} color={colors.teal} />
                <Text style={[styles.paywallFeatureText, { color: colors.foreground }]}>
                  Higher resolution exports
                </Text>
              </View>
              <View style={styles.paywallFeature}>
                <Icon name="check" size={16} color={colors.teal} />
                <Text style={[styles.paywallFeatureText, { color: colors.foreground }]}>
                  Support a small team
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.paywallCta, { backgroundColor: colors.gold }]}
              onPress={handleUnlock}
              activeOpacity={0.85}
            >
              <Text style={styles.paywallCtaText}>Unlock for £1</Text>
            </TouchableOpacity>

            <Text style={[styles.paywallFinePrint, { color: colors.mutedForeground }]}>
              One-time purchase · Restored automatically on this device
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      <ConnectSheet
        visible={connectOpen}
        onClose={() => setConnectOpen(false)}
        onSubmit={handleConnectSubmit}
        mode="send"
        defaultPlatform={myDefaultPlatform}
        defaultHandle={myDefaultHandle}
        theirCountry={match.theirCountry}
        theirCountryFlag={match.theirCountryFlag}
      />
    </View>
  );
}

const PHOTO_W = (width - 48 - 32 - 2) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
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
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  sameDayBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  sameDayEmoji: { fontSize: 26 },
  sameDayTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sameDaySub: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  revealCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    overflow: "hidden",
  },
  newBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  themeEmoji: { fontSize: 28 },
  themeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  themeTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  photoPair: {
    flexDirection: "row",
    gap: 1,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "stretch",
  },
  photoWrapper: {
    flex: 1,
    gap: 8,
  },
  photo: {
    width: "100%",
    height: 160,
    borderRadius: 12,
  },
  photoLabelTime: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  vsBar: {
    width: 1,
    marginVertical: 0,
  },
  divider: {
    height: 1,
  },
  vibeBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  echoBox: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  echoHeadline: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  echoHeadlineSoft: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.2,
  },
  echoSub: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  countryRevealWrap: {
    alignItems: "center",
    gap: 10,
  },
  geoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  geoChipEmoji: { fontSize: 12 },
  geoChipText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  lifetimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  lifetimePillEmoji: { fontSize: 14 },
  lifetimePillNum: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  lifetimePillLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
  vibeLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  vibeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vibeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  vibeChipEmoji: {
    fontSize: 14,
  },
  vibeChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 28,
  },
  nextBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  tierTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tierSparkles: {
    fontSize: 12,
    letterSpacing: 1,
  },
  watermark: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  watermarkSparkle: {
    fontSize: 14,
  },
  watermarkText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
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
  connectCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  connectIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  connectTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  connectSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  shareRow: {
    flexDirection: "row",
    gap: 10,
  },
  shareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  upsellBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  upsellEmoji: { fontSize: 14 },
  upsellText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  proBadge: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
  },
  paywallBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  paywallCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  paywallClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  paywallSparkle: { fontSize: 40, marginTop: 4 },
  paywallTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  paywallPrice: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  paywallFeatures: {
    width: "100%",
    gap: 10,
    paddingVertical: 10,
  },
  paywallFeature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paywallFeatureText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  paywallCta: {
    width: "100%",
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  paywallCtaText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#001018",
  },
  paywallFinePrint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
});
