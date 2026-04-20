import React from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { BadgeCard } from "@/components/BadgeCard";
import { PhotoCard } from "@/components/PhotoCard";
import { tagEmoji, tagLabel } from "@/utils/interests";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    matches,
    matchedCountries,
    streakCount,
    totalMatches,
    badges,
    myPhotos,
    getWorldMapCoverage,
    removeMatch,
    changeVerdict,
    connectRequests,
    unreadIncoming,
    pendingOutgoing,
    myVibe,
  } = useApp();
  // Split history by verdict — confirmed Same Same matches drive the
  // journey, recent "different" passes get their own reconsider section.
  const confirmedMatches = React.useMemo(
    () => matches.filter((m) => m.verdict === "same"),
    [matches],
  );
  const passedMatches = React.useMemo(
    () => matches.filter((m) => m.verdict === "different"),
    [matches],
  );
  // Tags I keep matching on across all my matches — answers the question
  // "what kinds of moments and people do I keep finding?".
  const recurringMatchTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of confirmedMatches) {
      for (const t of m.sharedTags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, n]) => ({ tag: t, count: n }));
  }, [confirmedMatches]);

  const reconsiderAsSame = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const flipped = changeVerdict(id, "same");
    if (flipped) {
      router.push({
        pathname: "/reveal",
        params: { matchData: JSON.stringify(flipped) },
      });
    }
  };

  const confirmPassInstead = (id: string, country: string) => {
    const doFlip = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      changeVerdict(id, "different");
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm(`Move your match with ${country} into Recent passes? Your country count will update.`)) {
        doFlip();
      }
      return;
    }
    Alert.alert(
      "Change to Different?",
      `This moves your match with ${country} out of your matches. You can change it back any time.`,
      [
        { text: "Keep as match", style: "cancel" },
        { text: "Mark as Different", style: "destructive", onPress: doFlip },
      ],
    );
  };
  const connectionsCount = connectRequests.filter(
    (r) => r.status === "accepted",
  ).length;

  const confirmUndo = (id: string, country: string) => {
    const doRemove = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      removeMatch(id);
    };
    if (Platform.OS === "web") {
      // RN Alert on web doesn't render buttons; fall back to window.confirm.
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm(`Undo this match with ${country}? This removes it from your history.`)) {
        doRemove();
      }
      return;
    }
    Alert.alert(
      "Undo this match?",
      `This removes your match with ${country} from your history. Earned badges stay.`,
      [
        { text: "Keep", style: "cancel" },
        { text: "Undo match", style: "destructive", onPress: doRemove },
      ],
    );
  };

  const earnedBadges = badges.filter((b) => b.earned).length;

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
              <Text style={styles.heroStatNum}>{getWorldMapCoverage()}%</Text>
              <Text style={styles.heroStatLabel}>world</Text>
            </View>
          </View>
        </View>

        {(myVibe.length > 0 || recurringMatchTags.length > 0) && (
          <View
            style={[
              styles.vibeCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {myVibe.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={[styles.vibeCardLabel, { color: colors.mutedForeground }]}>
                  Your vibe
                </Text>
                <View style={styles.vibeChipsRow}>
                  {myVibe.map((t) => (
                    <View
                      key={t}
                      style={[
                        styles.vibeChip,
                        {
                          backgroundColor: colors.teal + "1f",
                          borderColor: colors.teal + "44",
                        },
                      ]}
                    >
                      <Text style={styles.vibeChipEmoji}>{tagEmoji(t)}</Text>
                      <Text style={[styles.vibeChipText, { color: colors.teal }]}>
                        {tagLabel(t)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.vibeHint, { color: colors.mutedForeground }]}>
                  What your photos say about you. Used to find people who share
                  your interests.
                </Text>
              </View>
            )}
            {recurringMatchTags.length > 0 && (
              <View style={{ gap: 10, marginTop: myVibe.length > 0 ? 16 : 0 }}>
                <Text style={[styles.vibeCardLabel, { color: colors.mutedForeground }]}>
                  You keep matching on
                </Text>
                <View style={styles.vibeChipsRow}>
                  {recurringMatchTags.map(({ tag, count }) => (
                    <View
                      key={tag}
                      style={[
                        styles.vibeChip,
                        {
                          backgroundColor: colors.gold + "22",
                          borderColor: colors.gold + "55",
                        },
                      ]}
                    >
                      <Text style={styles.vibeChipEmoji}>{tagEmoji(tag)}</Text>
                      <Text style={[styles.vibeChipText, { color: colors.gold }]}>
                        {tagLabel(tag)} · {count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={() => router.push("/connections")}
          activeOpacity={0.85}
          style={[
            styles.connectionsRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          accessibilityLabel="Open connections"
        >
          <View
            style={[
              styles.connectionsIcon,
              {
                backgroundColor:
                  unreadIncoming > 0 ? colors.teal : colors.teal + "22",
              },
            ]}
          >
            <Icon
              name="bell"
              size={18}
              color={unreadIncoming > 0 ? "#001018" : colors.teal}
            />
            {unreadIncoming > 0 && (
              <View style={[styles.connectionsDot, { backgroundColor: colors.gold, borderColor: colors.card }]}>
                <Text style={styles.connectionsDotText}>{unreadIncoming}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.connectionsTitle, { color: colors.foreground }]}>
              Connections
            </Text>
            <Text style={[styles.connectionsSub, { color: colors.mutedForeground }]}>
              {unreadIncoming > 0
                ? `${unreadIncoming} new — tap to respond`
                : pendingOutgoing > 0
                ? `${pendingOutgoing} request${pendingOutgoing === 1 ? "" : "s"} awaiting reply`
                : connectionsCount > 0
                ? `${connectionsCount} mutual reveal${connectionsCount === 1 ? "" : "s"}`
                : "Anonymous social swaps with your matches"}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

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

        {confirmedMatches.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Match History
              </Text>
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                Tap to change
              </Text>
            </View>
            <View style={styles.matchList}>
              {confirmedMatches.slice(0, 10).map((match) => (
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
                    <TouchableOpacity
                      onPress={() => confirmPassInstead(match.id, match.theirCountry)}
                      hitSlop={8}
                      accessibilityLabel={`Change match with ${match.theirCountry} to Different`}
                    >
                      <Text style={[styles.matchAction, { color: colors.mutedForeground }]}>
                        Change to Different
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <PhotoCard uri={match.theirPhoto} size="sm" />
                  <TouchableOpacity
                    onPress={() => confirmUndo(match.id, match.theirCountry)}
                    style={[styles.undoBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    accessibilityLabel={`Remove match with ${match.theirCountry} from history`}
                    hitSlop={8}
                  >
                    <Icon name="trash-2" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {passedMatches.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Recent passes
              </Text>
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                Changed your mind?
              </Text>
            </View>
            <View style={styles.matchList}>
              {passedMatches.slice(0, 10).map((match) => (
                <View
                  key={match.id}
                  style={[
                    styles.matchRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: 0.92,
                    },
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
                    <Text style={[styles.matchAction, { color: colors.mutedForeground }]}>
                      You said different
                    </Text>
                  </View>
                  <PhotoCard uri={match.theirPhoto} size="sm" />
                  <TouchableOpacity
                    onPress={() => reconsiderAsSame(match.id)}
                    style={[
                      styles.reconsiderBtn,
                      { backgroundColor: colors.teal },
                    ]}
                    accessibilityLabel={`Mark photo from ${match.theirCountry} as Same Same`}
                    hitSlop={8}
                  >
                    <Text style={styles.reconsiderBtnText}>Same Same</Text>
                  </TouchableOpacity>
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
  vibeCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  vibeCardLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
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
  vibeHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  connectionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  connectionsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  connectionsDot: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionsDotText: {
    color: "#001018",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  connectionsTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  connectionsSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
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
  matchAction: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textDecorationLine: "underline",
    marginTop: 2,
  },
  reconsiderBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  reconsiderBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#001018",
    letterSpacing: 0.3,
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
  undoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
