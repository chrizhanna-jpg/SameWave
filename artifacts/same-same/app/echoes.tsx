import React, { useEffect } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import type { EchoNotification } from "@/context/AppContext";
import { getGeoTier, getTimeTier } from "@/utils/celebrations";
import { tagEmoji, tagLabel } from "@/utils/interests";
import { timeAgo } from "@/utils/timeAgo";

export default function EchoesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { echoes, markAllEchoesSeen, myCountryCode } = useApp();

  // Mark every echo as seen once the user has had a moment to glance at
  // the list. Slight delay so the unread highlight is briefly visible
  // (people like seeing what's new).
  useEffect(() => {
    const t = setTimeout(() => markAllEchoesSeen(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            Echoes
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Strangers who said same same to your photos
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
        {echoes.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={styles.emptyEmoji}>🔁</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No echoes yet
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              When someone somewhere says same same to one of your photos,
              you'll see it here.
            </Text>
          </View>
        ) : (
          echoes.map((echo) => (
            <EchoCard
              key={echo.id}
              echo={echo}
              myCountryCode={myCountryCode}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function EchoCard({
  echo,
  myCountryCode,
}: {
  echo: EchoNotification;
  myCountryCode?: string;
}) {
  const colors = useColors();
  const time = getTimeTier(echo.timestamp, echo.theirPhotoMinutesAgo);
  const geo = getGeoTier(myCountryCode, echo.theirCountryCode);
  const headlineColor =
    time.kind === "minute"
      ? colors.gold
      : time.kind === "hour"
      ? colors.teal
      : colors.mutedForeground;

  // Card highlight when unread — soft teal tint + accent left border.
  const highlight = !echo.seen;

  const ago = timeAgo(new Date(echo.timestamp));

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: highlight ? colors.teal + "0c" : colors.card,
          borderColor: highlight ? colors.teal + "55" : colors.border,
        },
      ]}
    >
      {/* Header: stranger flag + country + time-since received + unread dot */}
      <View style={styles.cardHeader}>
        <Text style={styles.bigFlag}>{echo.theirCountryFlag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.cardTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            Someone in {echo.theirCountry}
          </Text>
          <Text
            style={[styles.cardSub, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            said same same to your photo · {ago}
          </Text>
        </View>
        {highlight && (
          <View style={[styles.unreadDot, { backgroundColor: colors.gold }]} />
        )}
      </View>

      {/* Photo pair — your photo on the left, their photo on the right,
          mirroring the discovery feed but framed from your perspective. */}
      <View style={styles.photosRow}>
        <View style={styles.photoCol}>
          <Image source={{ uri: echo.myPhoto }} style={styles.photo} />
          <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
            yours
          </Text>
        </View>
        <Icon name="arrow-right" size={18} color={colors.mutedForeground} />
        <View style={styles.photoCol}>
          <Image source={{ uri: echo.theirPhoto }} style={styles.photo} />
          <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
            theirs
          </Text>
        </View>
      </View>

      {/* Three uniform tier slots — same layout as discovery feed so the
          two surfaces feel like a single visual system. */}
      <View style={styles.chipRow}>
        <View
          style={[
            styles.chip,
            {
              backgroundColor: headlineColor + "1f",
              borderColor: headlineColor + "55",
            },
          ]}
        >
          <Text style={styles.chipEmoji}>{time.emoji}</Text>
          <Text
            style={[styles.chipText, { color: headlineColor }]}
            numberOfLines={1}
          >
            {time.label}
          </Text>
        </View>
        <View
          style={[
            styles.chip,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Text style={styles.chipEmoji}>{geo.emoji}</Text>
          <Text
            style={[styles.chipText, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {geo.kind === "continent"
              ? geo.label.replace(/^Same Continent · /i, "")
              : geo.kind === "country"
              ? "Same country"
              : "Same planet"}
          </Text>
        </View>
        <View
          style={[
            styles.chip,
            echo.sharedTags && echo.sharedTags.length > 0
              ? {
                  backgroundColor: colors.teal + "1a",
                  borderColor: colors.teal + "44",
                }
              : { backgroundColor: "transparent", borderColor: "transparent" },
          ]}
        >
          {echo.sharedTags && echo.sharedTags.length > 0 && (
            <>
              <Text style={styles.chipEmoji}>
                {tagEmoji(echo.sharedTags[0])}
              </Text>
              <Text
                style={[styles.chipText, { color: colors.teal }]}
                numberOfLines={1}
              >
                {tagLabel(echo.sharedTags[0])}
                {echo.sharedTags.length > 1
                  ? ` +${echo.sharedTags.length - 1}`
                  : ""}
              </Text>
            </>
          )}
        </View>
      </View>
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
    gap: 14,
  },
  card: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bigFlag: { fontSize: 28 },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  cardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  photosRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  photoCol: { flex: 1, gap: 6, alignItems: "center" },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
  },
  photoLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 12 },
  chipText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
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
