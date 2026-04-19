import React, { useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { GlobeAnimation } from "@/components/GlobeAnimation";
import { getTodaysChallenge } from "@/data/samplePhotos";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { streakCount, matches, matchedCountries, myPhotos } = useApp();
  const challenge = getTodaysChallenge();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const totalMatches = matches.length;
  const hasUploadedPhoto = myPhotos.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 100 },
        ]}
      >
        {/* Hero Globe */}
        <View style={styles.hero}>
          <GlobeAnimation size={190} />
          <Text style={[styles.appName, { color: colors.foreground }]}>
            Same Same
          </Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            One world. Daily moments.
          </Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {streakCount}
            </Text>
            <Feather name="zap" size={14} color={colors.gold} style={styles.statIcon} />
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Streak
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {totalMatches}
            </Text>
            <Feather name="layers" size={14} color={colors.teal} style={styles.statIcon} />
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Matches
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {matchedCountries.length}
            </Text>
            <Feather name="globe" size={14} color={colors.accent} style={styles.statIcon} />
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Countries
            </Text>
          </View>
        </View>

        {/* Daily challenge */}
        <TouchableOpacity
          style={[styles.challengeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/(tabs)/match")}
          activeOpacity={0.85}
        >
          <View style={styles.challengeLeft}>
            <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
            <View>
              <Text style={[styles.challengeLabel, { color: colors.mutedForeground }]}>
                Today's theme
              </Text>
              <Text style={[styles.challengeTitle, { color: colors.foreground }]}>
                {challenge.title}
              </Text>
            </View>
          </View>
          <View style={[styles.playChip, { backgroundColor: colors.primary }]}>
            <Feather name="play" size={12} color="#fff" />
            <Text style={styles.playChipText}>Play</Text>
          </View>
        </TouchableOpacity>

        {/* Main CTA */}
        <TouchableOpacity
          style={[styles.matchBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/(tabs)/match")}
          activeOpacity={0.88}
        >
          <Feather name="layers" size={20} color="#fff" />
          <Text style={styles.matchBtnText}>Start Matching</Text>
        </TouchableOpacity>

        {/* Upload photo prompt */}
        {!hasUploadedPhoto && (
          <TouchableOpacity
            style={[styles.uploadPrompt, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => router.push("/camera")}
            activeOpacity={0.85}
          >
            <Feather name="camera" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.uploadTitle, { color: colors.foreground }]}>
                Add your photo
              </Text>
              <Text style={[styles.uploadSub, { color: colors.mutedForeground }]}>
                Get matched with your own daily moments
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {/* Recent matches */}
        {matches.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Recent
              </Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/profile")}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>
                  See all
                </Text>
              </TouchableOpacity>
            </View>
            {matches.slice(0, 3).map((m) => (
              <View
                key={m.id}
                style={[styles.recentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={styles.recentFlag}>{m.theirCountryFlag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recentCountry, { color: colors.foreground }]}>
                    {m.theirCountry}
                  </Text>
                  <Text style={[styles.recentVerdict, {
                    color: m.verdict === "same" ? colors.teal : colors.primary,
                  }]}>
                    {m.verdict === "same" ? "Same Same" : "Different"} · {m.similarityScore}%
                  </Text>
                </View>
                <Feather
                  name={m.verdict === "same" ? "heart" : "x"}
                  size={14}
                  color={m.verdict === "same" ? colors.teal : colors.primary}
                />
              </View>
            ))}
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
  hero: {
    alignItems: "center",
    gap: 10,
    paddingBottom: 4,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
    marginTop: 4,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  statNum: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  statIcon: {
    marginTop: -2,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  challengeCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
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
    fontFamily: "Inter_400Regular",
  },
  challengeTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 1,
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
    fontFamily: "Inter_600SemiBold",
  },
  matchBtn: {
    width: "100%",
    height: 58,
    borderRadius: 29,
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
  uploadPrompt: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  uploadTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  uploadSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
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
    fontFamily: "Inter_500Medium",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
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
