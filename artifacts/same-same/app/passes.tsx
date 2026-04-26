import React from "react";
import {
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

export default function PassesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { matches, changeVerdict, myCountryCode } = useApp();

  const passedMatches = React.useMemo(
    () => matches.filter((m) => m.verdict === "different"),
    [matches],
  );

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
            Recent Different
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {passedMatches.length}{" "}
            {passedMatches.length === 1 ? "pass" : "passes"} · changed your
            mind?
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
        {passedMatches.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={styles.emptyEmoji}>👀</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Nothing to reconsider
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Photos you swipe Different on will land here, in case you change
              your mind later.
            </Text>
          </View>
        ) : (
          passedMatches.map((match) => (
            <View
              key={match.id}
              style={[
                styles.passedCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.passedHeader}>
                <Text style={styles.matchFlag}>🌍</Text>
                <Icon
                  name="arrow-right"
                  size={12}
                  color={colors.mutedForeground}
                />
                <Text style={styles.matchFlag}>{match.theirCountryFlag}</Text>
                <Text
                  style={[styles.passedCountry, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {match.theirCountry}
                </Text>
              </View>

              <View style={styles.passedPhotos}>
                <PhotoCard uri={match.myPhoto} size="sm" />
                <Icon
                  name="arrow-right"
                  size={16}
                  color={colors.mutedForeground}
                />
                <PhotoCard uri={match.theirPhoto} size="sm" />
              </View>

              <View style={styles.passedChips}>
                <MatchTierChips match={match} myCountryCode={myCountryCode} />
              </View>

              <View style={styles.passedFooter}>
                <Text
                  style={[styles.matchAction, { color: colors.mutedForeground }]}
                >
                  You said different
                </Text>
                <TouchableOpacity
                  onPress={() => reconsiderAsSame(match.id)}
                  style={[styles.reconsiderBtn, { backgroundColor: colors.teal }]}
                  accessibilityLabel={`Mark photo from ${match.theirCountry} as Wave`}
                  hitSlop={8}
                >
                  <Text style={styles.reconsiderBtnText}>Wave</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
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
    gap: 12,
  },
  passedCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  passedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  passedCountry: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    marginLeft: 4,
  },
  passedPhotos: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  passedChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  passedFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  matchFlag: { fontSize: 14 },
  matchAction: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  reconsiderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  reconsiderBtnText: {
    color: "#001018",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  emptyCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
    marginTop: 32,
  },
  emptyEmoji: { fontSize: 36 },
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
