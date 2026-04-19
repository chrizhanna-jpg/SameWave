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
import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import type { Match } from "@/context/AppContext";

const { width } = Dimensions.get("window");

export default function RevealScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { addMatch, matchedCountries, proUnlocked, unlockPro } = useApp();
  const [match, setMatch] = useState<Match | null>(null);
  const [sharing, setSharing] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
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
            dialogTitle: "Share your Same Same",
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

        // Save the match immediately — every "Same Same" counts
        if (!savedRef.current) {
          savedRef.current = true;
          addMatch(m);
        }

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

  if (!match) return null;

  const isNewCountry = !matchedCountries.some(
    (c) => c.code === match.theirCountryCode
  );

  // The special moment: same activity, within 24h
  const myAgeMin = match.myPhotoUploadedAt
    ? (Date.now() - new Date(match.myPhotoUploadedAt).getTime()) / 60000
    : 9999;
  const theirAgeMin = match.theirPhotoMinutesAgo ?? 9999;
  const isSameDay = myAgeMin < 1440 && theirAgeMin < 1440;

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
        {isSameDay && (
          <Animated.View
            style={[
              styles.sameDayBanner,
              {
                backgroundColor: colors.gold + "1f",
                borderColor: colors.gold,
                opacity: sparkleOpacity,
                transform: [{ scale: sparkleScale }],
              },
            ]}
          >
            <Text style={styles.sameDayEmoji}>✨</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sameDayTitle, { color: colors.gold }]}>
                Same Day Match
              </Text>
              <Text style={[styles.sameDaySub, { color: colors.foreground }]}>
                Both posted within 24 hours. Rare and beautiful.
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

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <CountryReveal
            leftCountry="Your Country"
            leftFlag="🌍"
            rightCountry={match.theirCountry}
            rightFlag={match.theirCountryFlag}
          />

          <View
            style={[
              styles.insightBox,
              { backgroundColor: colors.teal + "18", borderColor: colors.teal + "40" },
            ]}
          >
            <Icon name="heart" size={16} color={colors.teal} />
            <Text style={[styles.insightText, { color: colors.teal }]}>
              {isSameDay
                ? `Right now, you and someone in ${match.theirCountry} are both living this moment.`
                : `Across the world, someone in ${match.theirCountry} shared the same thing.`}
            </Text>
          </View>

          {!proUnlocked && (
            <View style={styles.watermark}>
              <Text style={styles.watermarkText}>Same Same · samesame.app</Text>
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
            <Text style={[styles.statNum, { color: isSameDay ? colors.gold : colors.teal }]}>
              {isSameDay ? "Today" : "Recent"}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {isSameDay ? "same day" : "this week"}
            </Text>
          </View>
        </Animated.View>

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
              Same Same Pro
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
