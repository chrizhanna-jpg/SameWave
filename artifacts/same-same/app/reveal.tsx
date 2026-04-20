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
  } = useApp();
  const [match, setMatch] = useState<Match | null>(null);
  const [sharing, setSharing] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectSent, setConnectSent] = useState(false);
  const savedRef = useRef(false);
  const shotRef = useRef<ViewShot>(null);

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
          It's a match
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
        {isCelebrated && (
          <Animated.View
            style={[
              styles.sameDayBanner,
              {
                backgroundColor:
                  timeTier.rank >= 3 ? colors.gold + "2a" : colors.gold + "1f",
                borderColor: colors.gold,
                borderWidth: timeTier.rank >= 3 ? 2 : 1,
                opacity: timeTier.rank >= 2 ? sparkleOpacity : 1,
              },
            ]}
          >
            <Text style={styles.sameDayEmoji}>{timeTier.emoji}</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.tierTitleRow}>
                <Text style={[styles.sameDayTitle, { color: colors.gold }]}>
                  {timeTier.label}
                </Text>
                {timeTier.sparkles > 0 && (
                  <Text style={[styles.tierSparkles, { color: colors.gold }]}>
                    {"✨".repeat(timeTier.sparkles)}
                  </Text>
                )}
              </View>
              <Text style={[styles.sameDaySub, { color: colors.foreground }]}>
                {timeTier.sub}
              </Text>
            </View>
          </Animated.View>
        )}

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
            styles.revealCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {isNewCountry && (
            <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
              <Icon name="star" size={12} color="#fff" />
              <Text style={styles.newBadgeText}>New country!</Text>
            </View>
          )}

          <View style={styles.themeRow}>
            <Text style={styles.themeEmoji}>{themeEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.themeLabel, { color: colors.mutedForeground }]}>
                You both shared
              </Text>
              <Text style={[styles.themeTitle, { color: colors.foreground }]}>
                {themeTitle}
              </Text>
            </View>
          </View>

          <View style={styles.photoPair}>
            <View style={styles.photoWrapper}>
              <Image
                source={{ uri: match.myPhoto }}
                style={styles.photo}
                resizeMode="cover"
              />
              <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
                Your photo
              </Text>
              {match.myPhotoUploadedAt && (
                <Text style={[styles.photoLabelTime, { color: colors.mutedForeground }]}>
                  {timeAgo(new Date(match.myPhotoUploadedAt))}
                </Text>
              )}
            </View>
            <View style={[styles.vsBar, { backgroundColor: colors.border }]} />
            <View style={styles.photoWrapper}>
              <Image
                source={{ uri: match.theirPhoto }}
                style={styles.photo}
                resizeMode="cover"
              />
              <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
                Their photo
              </Text>
              {match.theirPhotoMinutesAgo != null && (
                <Text style={[styles.photoLabelTime, { color: colors.mutedForeground }]}>
                  {timeAgo(simulatedPostedAt(match.theirPhotoMinutesAgo))}
                </Text>
              )}
            </View>
          </View>

          {match.matchStats && match.matchStats.sameAllTime > 0 && (() => {
            // Defensive coerce: if anything came back as null/NaN/undefined
            // from the wire we treat it as 0 so .toLocaleString() never
            // throws and the headline math stays sane.
            const raw = match.matchStats!;
            const n = (v: unknown) =>
              typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
            const s = {
              sameLastHour: n(raw.sameLastHour),
              sameLastDay: n(raw.sameLastDay),
              sameAllTime: n(raw.sameAllTime),
            };
            // Build the punchiest line we can: prefer "in the last hour"
            // when there's recent activity, otherwise fall back to day,
            // otherwise total. This always shows ONE clean stat — extra
            // detail goes in the smaller chip row below.
            const headline =
              s.sameLastHour > 0
                ? { count: s.sameLastHour, when: "in the last hour" }
                : s.sameLastDay > 0
                ? { count: s.sameLastDay, when: "in the last day" }
                : { count: s.sameAllTime, when: "all time" };
            return (
              <View
                style={[
                  styles.echoBox,
                  {
                    backgroundColor: colors.teal + "1a",
                    borderColor: colors.teal + "55",
                  },
                ]}
              >
                <Text style={[styles.echoHeadline, { color: colors.teal }]}>
                  {headline.count.toLocaleString()}{" "}
                  <Text style={[styles.echoHeadlineSoft, { color: colors.teal }]}>
                    {headline.count === 1 ? "other person also" : "others also"} said same same
                  </Text>
                </Text>
                <Text style={[styles.echoSub, { color: colors.mutedForeground }]}>
                  {headline.when} · {s.sameAllTime.toLocaleString()} total
                </Text>
                {(s.sameLastHour > 0 || s.sameLastDay > 0) && s.sameAllTime > 1 && (
                  <View style={styles.echoChipRow}>
                    {[
                      { label: "Last hour", value: s.sameLastHour },
                      { label: "Last day", value: s.sameLastDay },
                      { label: "All time", value: s.sameAllTime },
                    ].map((b) => (
                      <View
                        key={b.label}
                        style={[
                          styles.echoChip,
                          {
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.echoChipValue, { color: colors.foreground }]}>
                          {b.value.toLocaleString()}
                        </Text>
                        <Text style={[styles.echoChipLabel, { color: colors.mutedForeground }]}>
                          {b.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })()}

          {(() => {
            const theirVibe = match.theirVibe ?? [];
            const shared = commonInterests(myVibe, theirVibe);
            const showShared = shared.length > 0;
            const showVibe = !showShared && theirVibe.length > 0;
            if (!showShared && !showVibe) return null;
            const tags = showShared ? shared : theirVibe.slice(0, 4);
            return (
              <View
                style={[
                  styles.vibeBox,
                  {
                    backgroundColor: showShared
                      ? colors.gold + "1a"
                      : colors.card,
                    borderColor: showShared
                      ? colors.gold + "55"
                      : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.vibeLabel,
                    { color: showShared ? colors.gold : colors.mutedForeground },
                  ]}
                >
                  {showShared
                    ? `You both seem to love`
                    : `Their vibe`}
                </Text>
                <View style={styles.vibeChipsRow}>
                  {tags.map((t) => (
                    <View
                      key={t}
                      style={[
                        styles.vibeChip,
                        {
                          backgroundColor: showShared
                            ? colors.gold + "33"
                            : colors.teal + "1a",
                          borderColor: showShared
                            ? colors.gold + "66"
                            : colors.teal + "44",
                        },
                      ]}
                    >
                      <Text style={styles.vibeChipEmoji}>{tagEmoji(t)}</Text>
                      <Text
                        style={[
                          styles.vibeChipText,
                          {
                            color: showShared ? colors.gold : colors.teal,
                          },
                        ]}
                      >
                        {tagLabel(t)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <CountryReveal
            leftCountry="Your Country"
            leftFlag="🌍"
            rightCountry={match.theirCountry}
            rightFlag={match.theirCountryFlag}
          />

          <View style={styles.tierChipsRow}>
            <View
              style={[
                styles.tierChip,
                { backgroundColor: colors.teal + "18", borderColor: colors.teal + "55" },
              ]}
            >
              <Text style={styles.tierChipEmoji}>{geoTier.emoji}</Text>
              <Text style={[styles.tierChipText, { color: colors.teal }]}>
                {geoTier.label}
              </Text>
            </View>
            <View
              style={[
                styles.tierChip,
                { backgroundColor: colors.gold + "18", borderColor: colors.gold + "55" },
              ]}
            >
              <Text style={styles.tierChipEmoji}>{timeTier.emoji}</Text>
              <Text style={[styles.tierChipText, { color: colors.gold }]}>
                {timeTier.label}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.insightBox,
              { backgroundColor: colors.teal + "18", borderColor: colors.teal + "40" },
            ]}
          >
            <Icon name="heart" size={16} color={colors.teal} />
            <Text style={[styles.insightText, { color: colors.teal }]}>
              {timeTier.kind === "minute"
                ? `Right this minute, someone in ${match.theirCountry} is sharing the same thing.`
                : timeTier.kind === "hour"
                ? `Within the hour, someone in ${match.theirCountry} shared the same thing.`
                : timeTier.kind === "day"
                ? `Today, someone in ${match.theirCountry} shared the same thing.`
                : timeTier.kind === "week"
                ? `This week, someone in ${match.theirCountry} shared the same thing.`
                : `Across the world, someone in ${match.theirCountry} shared the same thing.`}
            </Text>
          </View>

          {!proUnlocked && (
            <View style={styles.watermark}>
              <Text style={styles.watermarkText}>ECHO · same same</Text>
            </View>
          )}
        </ViewShot>
        </Animated.View>

        <Animated.View
          style={[
            styles.statsRow,
            { opacity: fadeIn },
          ]}
        >
          <View style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {matchedCountries.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              countries
            </Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.statEmoji}>{themeEmoji}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {themeTitle.toLowerCase()}
            </Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: timeTier.rank >= 2 ? colors.gold : colors.teal }]}>
              {timeTier.kind === "minute"
                ? "Now"
                : timeTier.kind === "hour"
                ? "Hour"
                : timeTier.kind === "day"
                ? "Today"
                : timeTier.kind === "week"
                ? "Week"
                : "—"}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {timeTier.label.toLowerCase()}
            </Text>
          </View>
        </Animated.View>

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
    padding: 20,
    gap: 18,
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
  photoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  photoLabelTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
    opacity: 0.7,
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
  echoChipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  echoChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
  },
  echoChipValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  echoChipLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
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
  insightBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statChip: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  statEmoji: {
    fontSize: 22,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
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
  tierChipsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  tierChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierChipEmoji: { fontSize: 14 },
  tierChipText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  watermark: {
    alignSelf: "center",
    marginTop: -4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  watermarkText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.5,
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
