import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  useWindowDimensions,
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
import { captureRef } from "react-native-view-shot";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useProAccess } from "@/hooks/useProAccess";
import { shouldShowPaywalls } from "@/lib/monetization";
import { useSubscription } from "@/lib/revenuecat";
import { resolveMusicUrl } from "@/data/musicLibrary";
import {
  markUserInteracted,
  playClip,
  stopIfLease,
} from "@/utils/audio";
import { CountryReveal } from "@/components/CountryReveal";
import { ConnectSheet } from "@/components/ConnectSheet";
import { ConnectionAtlasShareCard } from "@/components/ConnectionAtlasShareCard";
import { SharePhotoCardPoster } from "@/components/SharePhotoCardPoster";
import {
  ShareLayoutModeToggle,
  type ShareLayoutMode,
} from "@/components/ShareLayoutModeToggle";
import { nameFor } from "@/data/countries";
import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import { getTimeTier, getGeoTier } from "@/utils/celebrations";
import { commonInterests, tagEmoji, tagLabel } from "@/utils/interests";
import type { Match } from "@/context/AppContext";
import {
  shareCaptureOptions,
  sharePreviewWidth,
  shareShotFrameStyle,
} from "@/utils/shareDimensions";
import { resolveMatchPhotoUris } from "@/utils/matchPhotoSnapshot";
import { confirmReportPhoto } from "@/utils/photoModeration";

export default function RevealScreen() {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const shareCardWidth = sharePreviewWidth(windowWidth);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const {
    matches,
    matchedCountries,
    sendConnectRequest,
    hasOutgoingForMatch,
    myDefaultPlatform,
    myDefaultHandle,
    myVibe,
    myCountryCode,
    myCountryFlag,
  } = useApp();
  // Live billing state. We never read the price from a hardcoded
  // string — `priceString` is the localised, store-formatted figure
  // ("£1.00" in GB, "$1.29" in US, etc.) so the paywall is always
  // accurate for the user's storefront. `purchase()` and `restore()`
  // are awaited round-trips through the native store SDK.
  const {
    proPackage,
    priceString,
    purchase,
    restore,
    isLoading: billingLoading,
    isPurchasing,
    isRestoring,
  } = useSubscription();
  const { proActive, showPaywalls } = useProAccess();
  const [match, setMatch] = useState<Match | null>(null);
  const [sharing, setSharing] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectSent, setConnectSent] = useState(false);
  const [shareLayoutMode, setShareLayoutMode] = useState<ShareLayoutMode>("card");
  const savedRef = useRef(false);
  const shotRef = useRef<View>(null);
  // The `action` param lets callers (MatchFlash, match-history) jump
  // straight to "Share" or open the remove-watermark paywall on mount,
  // skipping the extra tap. Guarded by a ref so a re-render of the
  // same screen doesn't re-fire the side-effect.
  const actionFiredRef = useRef(false);

  const handleShare = async () => {
    if (sharing || !shotRef.current) return;
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
          Alert.alert("Sharing unavailable", "Sharing isn't supported on this device.");
        } else {
          await Sharing.shareAsync(uri, {
            mimeType: "image/jpeg",
            dialogTitle: "Share your Wave",
          });
        }
      }
    } catch (err) {
      Alert.alert("Couldn't share", "Something went wrong creating the share image.");
    } finally {
      setSharing(false);
    }
  };

  // Real purchase via RevenueCat. The SDK fires the native store
  // sheet (Test Store in dev / Expo Go, Play Billing in Android prod,
  // StoreKit in iOS prod) and resolves with the new CustomerInfo. The
  // RevenueCatProBridge in _layout.tsx then mirrors the entitlement
  // onto AppContext.proUnlocked, so we just close the sheet here on
  // success and let the rest of the UI react to the flag flipping.
  const handleUnlock = async () => {
    if (isPurchasing || isRestoring) return;
    // If the offering has no purchasable package, the most common cause
    // is that the user already owns Pro on this store account — Play
    // Billing / the RevenueCat Test Store filter consumed non-renewing
    // products out of the offering once owned. Auto-restore in that
    // case: if the entitlement comes back active we close the paywall
    // (same success path as a purchase). Only if there's genuinely no
    // prior purchase do we surface an error.
    if (!proPackage) {
      try {
        const info = await restore();
        const granted = info.entitlements.active?.["pro"] != null;
        if (granted) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setPaywallOpen(false);
          return;
        }
        Alert.alert(
          "Pro isn't available right now",
          "We couldn't find a previous purchase on this store account either. Please try again in a moment.",
        );
      } catch (err: any) {
        Alert.alert(
          "Couldn't complete purchase",
          err?.message ?? "Please try again.",
        );
      }
      return;
    }
    try {
      const info = await purchase();
      const granted = info.entitlements.active?.["pro"] != null;
      if (granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPaywallOpen(false);
      }
    } catch (err: any) {
      // Treat user-cancellation as a no-op — RevenueCat sets
      // `userCancelled: true` on the error in that case. Anything else
      // is worth surfacing so the user knows it didn't go through.
      if (err?.userCancelled) return;
      Alert.alert(
        "Couldn't complete purchase",
        err?.message ?? "Please try again.",
      );
    }
  };

  // "Restore purchases" — required by Apple's review guidelines and a
  // generally good UX so users who reinstall (or sign in on a new
  // device) can re-claim their Pro unlock without paying again.
  const handleRestore = async () => {
    if (isRestoring) return;
    try {
      const info = await restore();
      const granted = info.entitlements.active?.["pro"] != null;
      if (granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPaywallOpen(false);
      } else {
        Alert.alert(
          "Nothing to restore",
          "We couldn't find a previous Pro purchase on this account.",
        );
      }
    } catch (err: any) {
      Alert.alert(
        "Couldn't restore",
        err?.message ?? "Please try again.",
      );
    }
  };

  // Audio: play the matched card's clip while the reveal is open,
  // then stop on unmount so we don't bleed into the next screen.
  //
  // Critical: the URL we hand to playClip MUST be byte-identical to
  // whatever the Match screen was already playing — otherwise the audio
  // singleton sees a "new" URL and switches clips, producing the
  // "music skipped to the next photo's vibe when I tapped Open/Share"
  // bug. So prefer the URL the Match screen snapshotted onto the match
  // record. Only fall back to recomputing for legacy matches that
  // predate `theirMusicUrl` — and even then, use the photo's own theme
  // and tags (saved as `theirActualTheme` / `theirTags`) instead of the
  // active-challenge `theme` field, which gave a different vibe and is
  // exactly what regressed this fix in the first place.
  const playLeaseRef = useRef<number>(0);
  useEffect(() => {
    if (!match) return;
    markUserInteracted();
    if (match.theirMusicUrl) {
      playLeaseRef.current = playClip(match.theirMusicUrl);
      return;
    }
    const url = resolveMusicUrl({
      customAudioUrl: match.theirCustomAudioUrl,
      musicGenre: match.theirMusicGenre,
      theme: match.theirActualTheme ?? match.theme,
      tags: match.theirTags,
      seed: match.theirPhoto,
    });
    if (url) playLeaseRef.current = playClip(url);
  }, [match]);
  useEffect(() => {
    return () => {
      void stopIfLease(playLeaseRef.current);
    };
  }, []);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const scaleIn = useRef(new Animated.Value(0.92)).current;
  const sparklePulse = useRef(new Animated.Value(0)).current;
  const matchInitedRef = useRef(false);

  useEffect(() => {
    if (shareLayoutMode !== "atlas") return;
    fadeIn.setValue(1);
    scaleIn.setValue(1);
  }, [shareLayoutMode, fadeIn, scaleIn]);

  useEffect(() => {
    const raw = params.matchId;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return;
    const found = matches.find((m) => m.id === id);
    if (!found) return;

    const uris = resolveMatchPhotoUris(found.id, {
      myPhoto: found.myPhoto,
      theirPhoto: found.theirPhoto,
    });
    const merged: Match = {
      ...found,
      myPhoto: uris.myPhoto,
      theirPhoto: uris.theirPhoto,
    };

    if (
      matchInitedRef.current &&
      match?.id === merged.id &&
      match.myPhoto === merged.myPhoto &&
      match.theirPhoto === merged.theirPhoto
    ) {
      return;
    }

    matchInitedRef.current = true;
    setMatch(merged);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.matchId, matches]);

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
        if (showPaywalls && !proActive) setPaywallOpen(true);
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

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  if (!match) {
    const rawMatchId = params.matchId;
    const matchIdParam = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
    const waitingForMatch =
      Boolean(matchIdParam) &&
      matches.length > 0 &&
      !matches.some((m) => m.id === matchIdParam);

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
          <TouchableOpacity
            onPress={handleNext}
            style={[styles.backBtn, { backgroundColor: colors.card }]}
          >
            <Icon name="x" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.matchMissingCenter}>
          <Text style={[styles.matchMissingText, { color: colors.mutedForeground }]}>
            {waitingForMatch
              ? "This match isn't available right now."
              : "Loading your match…"}
          </Text>
        </View>
      </View>
    );
  }

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
  const myCountryName = nameFor(myCountryCode) ?? "You";

  // The "same X" chips that summarise WHY this match happened. These ride
  // inside the shareable card so the social-media image makes immediate
  // sense to anyone who sees it without context. The first chip is the
  // matched vibe itself — we show the actual theme name (e.g. "sunset",
  // "morning coffee") rather than a generic "same vibe" label so the
  // share image tells the viewer exactly what the two strangers shared.
  // Then we add a time chip if the posts were close enough in time, and
  // a geo chip describing how close geographically.
  const sparkleScale = sparklePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  const sparkleOpacity = sparklePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={handleNext}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Icon name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        {/* Header title intentionally blank — the Ripple wordmark with
            its two icons lives on the share card itself; duplicating it
            in the screen header read as repetition. The empty spacer
            keeps the close button left-aligned and balanced. */}
        <View style={{ flex: 1 }} />
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
              kind="ripple"
              fromCode={myCountryCode}
              toCode={match.theirCountryCode}
              myPhotoUri={match.myPhoto}
              theirPhotoUri={match.theirPhoto}
              myCountryFlag={myCountryFlag}
              theirCountryFlag={match.theirCountryFlag}
              themeTitle={themeTitle}
              themeEmoji={themeEmoji}
              timeTier={timeTier}
              geoTier={geoTier}
              showWatermark={!proActive}
              width={shareCardWidth}
            />
          ) : (
            <SharePhotoCardPoster
              variant="ripple"
              side={shareCardWidth}
              themeTitle={themeTitle}
              themeEmoji={themeEmoji}
              timeTier={timeTier}
              geoTier={geoTier}
              myPhotoUri={match.myPhoto}
              theirPhotoUri={match.theirPhoto}
              myCountryFlag={myCountryFlag}
              myCountryName={myCountryName}
              theirCountry={match.theirCountry}
              theirCountryFlag={match.theirCountryFlag}
              showWatermark={!proActive}
            />
          )}
        </View>
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

          {match.theirPhotoId ? (
            <TouchableOpacity
              style={[
                styles.shareBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() =>
                confirmReportPhoto(match.theirPhotoId!, {
                  countryLabel: match.theirCountry,
                })
              }
              activeOpacity={0.85}
              accessibilityLabel={`Report photo from ${match.theirCountry}`}
            >
              <Icon name="alert-circle" size={18} color={colors.mutedForeground} />
              <Text style={[styles.shareBtnText, { color: colors.mutedForeground }]}>
                Report
              </Text>
            </TouchableOpacity>
          ) : null}

          {!proActive && (
            <TouchableOpacity
              style={[styles.upsellBtn, { borderColor: colors.gold }]}
              onPress={() => setPaywallOpen(true)}
              activeOpacity={0.85}
            >
              <Icon name="wave" size={16} color={colors.gold} />
              <Text style={[styles.upsellText, { color: colors.gold }]}>
                {/* Show the live store price ("£1.00", "$1.29", …) so
                    the button always matches what the user will pay.
                    While the SDK is still resolving the offering we
                    fall back to a generic label so the button isn't
                    blank. */}
                {priceString
                  ? `Remove watermark · ${priceString}`
                  : "Remove watermark"}
              </Text>
            </TouchableOpacity>
          )}

          {proActive && (
            <View style={[styles.proBadge, { backgroundColor: colors.gold + "22", borderColor: colors.gold }]}>
              <Icon name="wave" size={16} color={colors.gold} />
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

      {/* Paywall modal — hidden when monetization is off for free launch */}
      <Modal
        visible={showPaywalls && paywallOpen}
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

            <Icon
              name="wave"
              size={40}
              color={colors.gold}
              style={styles.paywallSparkle}
            />
            <Text style={[styles.paywallTitle, { color: colors.foreground }]}>
              SameWave Pro
            </Text>
            <Text style={[styles.paywallPrice, { color: colors.gold }]}>
              {/* Live price from the store — never hardcoded. Falls
                  back to a placeholder while RevenueCat is still
                  fetching the offering on first paint. */}
              {priceString
                ? `${priceString} · one-time, lifetime`
                : "One-time, lifetime"}
            </Text>

            <View style={styles.paywallFeatures}>
              <View style={styles.paywallFeature}>
                <Icon name="check" size={16} color={colors.teal} />
                <Text style={[styles.paywallFeatureText, { color: colors.foreground }]}>
                  Clean share cards — no SameWave watermark
                </Text>
              </View>
              <View style={styles.paywallFeature}>
                <Icon name="check" size={16} color={colors.teal} />
                <Text style={[styles.paywallFeatureText, { color: colors.foreground }]}>
                  Photos shown full-size, stacked like the match screen
                </Text>
              </View>
              <View style={styles.paywallFeature}>
                <Icon name="check" size={16} color={colors.teal} />
                <Text style={[styles.paywallFeatureText, { color: colors.foreground }]}>
                  Higher-resolution exports
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.paywallCta,
                {
                  backgroundColor: colors.gold,
                  // Dim the CTA while the store sheet is in flight or
                  // the offering hasn't loaded yet — prevents the user
                  // from spamming the button into a queue of purchases.
                  opacity:
                    isPurchasing || isRestoring || billingLoading ? 0.6 : 1,
                },
              ]}
              onPress={handleUnlock}
              activeOpacity={0.85}
              disabled={isPurchasing || isRestoring || billingLoading}
            >
              <Text style={styles.paywallCtaText}>
                {isPurchasing
                  ? "Opening store…"
                  : isRestoring
                    ? "Restoring purchase…"
                    : priceString
                      ? `Unlock for ${priceString}`
                      : "Unlock"}
              </Text>
            </TouchableOpacity>

            {/* Restore link — required by Apple's review guidelines and
                the easiest path for users who reinstalled or signed in
                on a new device to re-claim their Pro entitlement. */}
            <TouchableOpacity
              onPress={handleRestore}
              disabled={isRestoring}
              accessibilityLabel="Restore previous purchase"
              style={styles.paywallRestore}
            >
              <Text style={[styles.paywallRestoreText, { color: colors.mutedForeground }]}>
                {isRestoring ? "Restoring…" : "Restore purchase"}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.paywallFinePrint, { color: colors.mutedForeground }]}>
              One-time purchase · Permanent unlock on your account
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  matchMissingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  matchMissingText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
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
    justifyContent: "center",
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
  shareChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
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
    // Square frames in the side-by-side layout keep the card short
    // enough for story-style social posts (was 4:5 portrait).
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  sharePhoto: {
    width: "100%",
    height: "100%",
  },
  // Flags now sit in a row below the photos, one per photo, centered in
  // their column. Same 36px diameter as the old absolute overlay.
  shareFlagRow: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "stretch",
    marginTop: 2,
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
  // Two-line attribution callout. The outer container stacks the
  // wordmark row above the "Find it on Google Play" subtitle, with
  // both lines centered. Bigger padding + bolder border so the pill
  // reads as an intentional "made with X" credit, not a stray UI
  // element.
  watermarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  watermarkSubtext: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
    marginTop: 2,
  },
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
  paywallRestore: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 4,
  },
  paywallRestoreText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
  },
  paywallFinePrint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
});
