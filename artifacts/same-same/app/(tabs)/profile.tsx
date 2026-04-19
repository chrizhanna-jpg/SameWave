import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { BadgeCard } from "@/components/BadgeCard";
import { PhotoCard } from "@/components/PhotoCard";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { matches, matchedCountries, streakCount, totalMatches, badges, myPhotos, getWorldMapCoverage } = useApp();

  const earnedBadges = badges.filter((b) => b.earned).length;
  const avgScore =
    matches.length > 0
      ? Math.round(matches.reduce((s, m) => s + m.similarityScore, 0) / matches.length)
      : 0;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          My Journey
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.heroTitle}>We Are One</Text>
          <Text style={styles.heroSubtitle}>
            You've connected with {matchedCountries.length} {matchedCountries.length === 1 ? "country" : "countries"} across the globe
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{totalMatches}</Text>
              <Text style={styles.heroStatLabel}>matches</Text>
            </View>
            <View style={[styles.heroDivider]} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{streakCount}</Text>
              <Text style={styles.heroStatLabel}>streak</Text>
            </View>
            <View style={[styles.heroDivider]} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{avgScore || "--"}%</Text>
              <Text style={styles.heroStatLabel}>avg score</Text>
            </View>
            <View style={[styles.heroDivider]} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{getWorldMapCoverage()}%</Text>
              <Text style={styles.heroStatLabel}>world</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Badges
            </Text>
            <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
              {earnedBadges}/{badges.length} earned
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.badgeScroll}
          >
            {badges.map((b) => (
              <View key={b.id} style={{ marginRight: 10 }}>
                <BadgeCard badge={b} />
              </View>
            ))}
          </ScrollView>
        </View>

        {matches.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Match History
            </Text>
            <View style={styles.matchList}>
              {matches.slice(0, 10).map((match) => (
                <View
                  key={match.id}
                  style={[
                    styles.matchRow,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <PhotoCard uri={match.myPhoto} size="sm" />
                  <View style={styles.matchMeta}>
                    <View style={styles.matchFlags}>
                      <Text style={styles.matchFlag}>🌍</Text>
                      <Icon name="arrow-right" size={12} color={colors.mutedForeground} />
                      <Text style={styles.matchFlag}>{match.theirCountryFlag}</Text>
                    </View>
                    <Text style={[styles.matchCountry, { color: colors.foreground }]}>
                      {match.theirCountry}
                    </Text>
                    <Text style={[styles.matchScore, { color: colors.primary }]}>
                      {match.similarityScore}% similar
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.matchVerdict,
                      {
                        backgroundColor:
                          match.verdict === "same"
                            ? colors.teal + "22"
                            : colors.primary + "22",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.matchVerdictText,
                        {
                          color:
                            match.verdict === "same" ? colors.teal : colors.primary,
                        },
                      ]}
                    >
                      {match.verdict === "same" ? "Same" : "Diff"}
                    </Text>
                  </View>
                  <PhotoCard uri={match.theirPhoto} size="sm" />
                </View>
              ))}
            </View>
          </View>
        )}

        {myPhotos.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              My Photos
            </Text>
            <View style={styles.photoGrid}>
              {myPhotos.slice(0, 9).map((photo, i) => (
                <PhotoCard key={i} uri={photo.uri} size="sm" style={styles.gridPhoto} />
              ))}
            </View>
          </View>
        )}

        {matches.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Icon name="globe" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Your journey starts here
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Swipe on some photo pairs to build your profile, earn badges, and fill your world map.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  heroCard: {
    borderRadius: 24,
    padding: 24,
    gap: 8,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginBottom: 16,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroStat: {
    alignItems: "center",
    flex: 1,
  },
  heroStatNum: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  heroStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  sectionCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  badgeScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  matchList: {
    gap: 8,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  matchMeta: {
    flex: 1,
    gap: 3,
  },
  matchFlags: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  matchFlag: {
    fontSize: 16,
  },
  matchCountry: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  matchScore: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  matchVerdict: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  matchVerdictText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridPhoto: {
    width: 100,
    height: 100,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
