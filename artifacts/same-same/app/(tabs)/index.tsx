import React, { useCallback } from "react";
import {
  Image,
  Platform,
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
import { RIPPLE_ONE_LINER, WAVE_ONE_LINER } from "@/data/waveRippleGlossary";
import { scrollPaddingAboveTabBar } from "@/utils/tabBarSafeArea";

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { matches, matchedCountries, mutualEchoes, resetOnboarding } =
    useApp();
  const challenge = getTodaysChallenge();

  useFocusEffect(
    useCallback(() => {
      markTabVisited("home");
    }, []),
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const scrollBottomPad = scrollPaddingAboveTabBar(insets);

  // Only confirmed ("same") swipes count as ripples. Previously this used
  // matches.length, which inflated the number with every "different"
  // verdict — making the home screen disagree with My Journey. Waves use
  // server-backed mutual echoes (`mutualEchoes`), same as match-history.
  const totalMatches = React.useMemo(
    () => matches.filter((m) => m.verdict === "same").length,
    [matches],
  );

  const totalWaves = React.useMemo(
    () => mutualEchoes.length,
    [mutualEchoes],
  );

  const matchesAnim = useCountUp(totalMatches);
  const wavesAnim = useCountUp(totalWaves);
  const countriesAnim = useCountUp(matchedCountries.length);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />
      <View
        style={[
          styles.content,
          {
            paddingTop: topPadding + 16,
            paddingBottom: scrollBottomPad,
          },
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
          <View
            style={styles.statItem}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Ripples: ${totalMatches}. ${RIPPLE_ONE_LINER}`}
          >
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
          <View
            style={styles.statItem}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`Waves: ${totalWaves}. ${WAVE_ONE_LINER}`}
          >
            <Text style={[styles.statNum, { color: colors.foreground }]}>
              {wavesAnim}
            </Text>
            <View style={styles.statLabelRow}>
              <Icon name="wave-glyph" size={12} color={colors.teal} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                Waves
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
          onPress={() => router.push("/camera?intent=challenge")}
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

        <PressableScale
          onPress={() => router.push("/camera?intent=interests")}
          haptic="light"
          style={styles.fullWidth}
        >
          <GradientCard gradient="challenge" radius="xl" elevation="md">
            <View style={styles.challengeInner}>
              <View style={styles.challengeLeft}>
                <Icon name="sparkles" size={28} color={colors.foreground} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.challengeLabel, { color: colors.mutedForeground }]}>
                    Your interests
                  </Text>
                  <Text style={[styles.challengeTitle, { color: colors.foreground }]}>
                    Share your passion.
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

        {/* Main CTA — jumps straight to the camera viewfinder so the
            Open → Snap → Match loop starts in one tap. Label intentionally
            stays "Start Rippling" — the ripple begins with the snap. */}
        <PressableScale
          onPress={() => router.push("/in-camera?from=home")}
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

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
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
});
