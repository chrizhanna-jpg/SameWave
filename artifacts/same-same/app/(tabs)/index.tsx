import React, { useCallback } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { markTabVisited } from "@/utils/tabVisits";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { OceanShimmer } from "@/components/OceanShimmer";
import { Surface } from "@/components/Surface";
import { GradientCard } from "@/components/GradientCard";
import { PressableScale } from "@/components/PressableScale";
import { useCountUp } from "@/hooks/useCountUp";
import { getTodaysChallenge } from "@/data/samplePhotos";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { matches, matchedCountries, resetOnboarding } = useApp();
  const challenge = getTodaysChallenge();

  useFocusEffect(
    useCallback(() => {
      markTabVisited("home");
    }, []),
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  // Only confirmed ("same") swipes count as matches. Previously this used
  // matches.length, which inflated the number with every "different"
  // verdict — making the home screen disagree with My Journey.
  const totalMatches = React.useMemo(
    () => matches.filter((m) => m.verdict === "same").length,
    [matches],
  );

  const matchesAnim = useCountUp(totalMatches);
  const countriesAnim = useCountUp(matchedCountries.length);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 110 },
        ]}
      >
        {/* Hero — static brand lockup (matches the app icon exactly).
            Animated globe is paused for v1.2.0; the icon image already
            contains the globe + wordmark + tagline + brand frame, so we
            simply render it. Swap this back to <EchoGlobeLogo /> when
            we're ready to bring the globe back to life. */}
        <View style={styles.hero}>
          <Image
            source={require("@/assets/images/samewave-logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="SameWave — Where minds meet"
          />
        </View>

        {/* Stats — layered surface, count-up numbers, tabular figures */}
        <Surface elevation="md" radius="xl" style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>
              {matchesAnim}
            </Text>
            <View style={styles.statLabelRow}>
              <Icon name="ripple" size={12} color={colors.teal} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Ripples
              </Text>
            </View>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>
              {countriesAnim}
            </Text>
            <View style={styles.statLabelRow}>
              <Icon name="globe" size={12} color={colors.accent} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Countries
              </Text>
            </View>
          </View>
        </Surface>

        {/* Daily challenge — gradient depth, springs on press */}
        <PressableScale
          onPress={() => router.push("/(tabs)/match")}
          haptic="light"
          style={styles.fullWidth}
        >
          <GradientCard gradient="challenge" radius="xl" elevation="md">
            <View style={styles.challengeInner}>
              <View style={styles.challengeLeft}>
                <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.challengeLabel, { color: colors.mutedForeground }]}>
                    Today's theme
                  </Text>
                  <Text style={[styles.challengeTitle, { color: colors.foreground }]}>
                    {challenge.title}
                  </Text>
                </View>
              </View>
              <View style={[styles.playChip, { backgroundColor: colors.primary }]}>
                <Icon name="play" size={12} color="#fff" />
                <Text style={styles.playChipText}>Play</Text>
              </View>
            </View>
          </GradientCard>
        </PressableScale>

        {/* Main CTA — primary gradient + glow shadow */}
        <PressableScale
          onPress={() => router.push("/(tabs)/match")}
          haptic="medium"
          style={styles.fullWidth}
        >
          <GradientCard
            gradient="primary"
            radius="pill"
            elevation="glowPrimary"
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.matchBtnInner}>
              <Icon name="ripple" size={20} color="#fff" />
              <Text style={styles.matchBtnText}>Start Rippling</Text>
            </View>
          </GradientCard>
        </PressableScale>

        {/* Restart tutorial */}
        <PressableScale
          onPress={() => {
            resetOnboarding();
            router.replace("/onboarding");
          }}
        >
          <View style={[styles.tutorialBtn, { borderColor: colors.borderSubtle }]}>
            <Icon name="rotate-ccw" size={14} color={colors.mutedForeground} />
            <Text style={[styles.tutorialText, { color: colors.mutedForeground }]}>
              Replay tutorial
            </Text>
          </View>
        </PressableScale>

        {/* Recent matches */}
        {matches.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Recent
              </Text>
              <PressableScale onPress={() => router.push("/(tabs)/profile")}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>
                  See all
                </Text>
              </PressableScale>
            </View>
            {matches.slice(0, 3).map((m) => {
              const myAgeMin = m.myPhotoUploadedAt
                ? (Date.now() - new Date(m.myPhotoUploadedAt).getTime()) / 60000
                : 9999;
              const sameDay =
                myAgeMin < 1440 && (m.theirPhotoMinutesAgo ?? 9999) < 1440;
              return (
                <Surface
                  key={m.id}
                  elevation="sm"
                  radius="lg"
                  style={styles.recentRow}
                >
                  <Text style={styles.recentFlag}>{m.theirCountryFlag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.recentCountry, { color: colors.foreground }]}>
                      {m.theirCountry}
                    </Text>
                    <Text style={[styles.recentVerdict, { color: colors.teal }]}>
                      Same wave{sameDay ? " · same day" : ""}
                    </Text>
                  </View>
                  <Icon name="heart" size={14} color={colors.teal} />
                </Surface>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 16,
  },
  fullWidth: { width: "100%" },
  hero: {
    alignItems: "center",
    gap: 10,
    paddingBottom: 4,
  },
  logo: {
    width: 300,
    height: 300,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  statsCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 18,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    opacity: 0.7,
  },
  statNum: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  challengeInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  challengeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  challengeEmoji: { fontSize: 28 },
  challengeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  challengeTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    marginTop: 2,
  },
  playChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  playChipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  matchBtnInner: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  matchBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  recentSection: {
    width: "100%",
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  tutorialBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "center",
  },
  tutorialText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "100%",
  },
  recentFlag: { fontSize: 24 },
  recentCountry: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  recentVerdict: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
});
