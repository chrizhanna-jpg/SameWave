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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { PhotoCard } from "@/components/PhotoCard";
import { MatchTierChips } from "@/components/MatchTierChips";

export default function MatchHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { matches, removeMatch, changeVerdict, myCountryCode, proUnlocked } =
    useApp();

  const confirmedMatches = React.useMemo(
    () => matches.filter((m) => m.verdict === "same"),
    [matches],
  );

  const confirmPassInstead = (id: string, country: string) => {
    const doFlip = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      changeVerdict(id, "different");
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (
        typeof window !== "undefined" &&
        window.confirm(
          `Move your match with ${country} into Recent passes? Your country count will update.`,
        )
      ) {
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

  const confirmUndo = (id: string, country: string) => {
    const doRemove = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      removeMatch(id);
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (
        typeof window !== "undefined" &&
        window.confirm(
          `Undo this match with ${country}? This removes it from your history.`,
        )
      ) {
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

  const topPadding = Platform.OS === "web" ? 8 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Match History
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {confirmedMatches.length}{" "}
            {confirmedMatches.length === 1 ? "match" : "matches"} · tap any to
            change
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {confirmedMatches.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Icon name="globe" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No matches yet
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Swipe Wave on photo pairs to start your journey.
            </Text>
          </View>
        ) : (
          confirmedMatches.map((match) => {
            // Tapping the row anywhere outside the inline controls
            // re-opens the full /reveal so the user can re-share or
            // remove the watermark from a past match. Tapping with an
            // explicit action shortcuts the extra step.
            const openReveal = (action?: "share" | "paywall") => {
              Haptics.selectionAsync();
              router.push({
                pathname: "/reveal",
                params: {
                  matchData: JSON.stringify(match),
                  ...(action ? { action } : {}),
                },
              });
            };
            return (
              <TouchableOpacity
                key={match.id}
                onPress={() => openReveal()}
                activeOpacity={0.85}
                accessibilityLabel={`Open match with ${match.theirCountry}`}
                style={[
                  styles.matchRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <PhotoCard uri={match.myPhoto} size="sm" />
                <View style={styles.matchMeta}>
                  <View style={styles.matchFlags}>
                    <Text style={styles.matchFlag}>🌍</Text>
                    <Icon
                      name="arrow-right"
                      size={12}
                      color={colors.mutedForeground}
                    />
                    <Text style={styles.matchFlag}>
                      {match.theirCountryFlag}
                    </Text>
                  </View>
                  <Text
                    style={[styles.matchCountry, { color: colors.foreground }]}
                  >
                    {match.theirCountry}
                  </Text>
                  <MatchTierChips match={match} myCountryCode={myCountryCode} />

                  {/* Quick-action row — Share + (if not pro) Remove
                      watermark are reachable here without opening the
                      full reveal. Each handler stops propagation so it
                      doesn't double-fire the row's "open reveal" tap. */}
                  <View style={styles.quickActions}>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        openReveal("share");
                      }}
                      style={[
                        styles.quickBtn,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                      hitSlop={6}
                      accessibilityLabel={`Share match with ${match.theirCountry}`}
                    >
                      <Icon
                        name="share"
                        size={12}
                        color={colors.foreground}
                      />
                      <Text
                        style={[
                          styles.quickBtnText,
                          { color: colors.foreground },
                        ]}
                      >
                        Share
                      </Text>
                    </TouchableOpacity>

                    {!proUnlocked && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation?.();
                          openReveal("paywall");
                        }}
                        style={[
                          styles.quickBtn,
                          { borderColor: colors.gold, backgroundColor: "transparent" },
                        ]}
                        hitSlop={6}
                        accessibilityLabel="Remove watermark from this match"
                      >
                        <Text style={styles.quickBtnEmoji}>✨</Text>
                        <Text
                          style={[
                            styles.quickBtnText,
                            { color: colors.gold },
                          ]}
                        >
                          Remove ✦
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation?.();
                      confirmPassInstead(match.id, match.theirCountry);
                    }}
                    hitSlop={8}
                    accessibilityLabel={`Change match with ${match.theirCountry} to Different`}
                  >
                    <Text
                      style={[
                        styles.matchAction,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Change to Different
                    </Text>
                  </TouchableOpacity>
                </View>
                <PhotoCard uri={match.theirPhoto} size="sm" />
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    confirmUndo(match.id, match.theirCountry);
                  }}
                  style={[
                    styles.undoBtn,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  accessibilityLabel={`Remove match with ${match.theirCountry} from history`}
                  hitSlop={8}
                >
                  <Icon
                    name="trash-2"
                    size={14}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 16,
    gap: 10,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  matchMeta: { flex: 1, gap: 4 },
  matchFlags: { flexDirection: "row", alignItems: "center", gap: 4 },
  matchFlag: { fontSize: 14 },
  matchCountry: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  matchAction: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
    textDecorationLine: "underline",
  },
  quickActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  quickBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  quickBtnEmoji: {
    fontSize: 11,
  },
  undoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
    marginTop: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
});
