import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { buildDiscoveryFeed, type DiscoveryItem } from "@/data/discoveryFeed";

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [windowKey, setWindowKey] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-rotate the feed every 60s so it visibly stays alive.
  useEffect(() => {
    const id = setInterval(() => {
      setWindowKey(Date.now().toString());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(() => buildDiscoveryFeed(14, windowKey), [windowKey]);

  const onRefresh = () => {
    setRefreshing(true);
    setWindowKey(Date.now().toString());
    // Tiny artificial delay so the spinner is perceptible.
    setTimeout(() => setRefreshing(false), 500);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Right now, around the world
        </Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          Live same-same moments from strangers everywhere
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {items.map((item) => (
          <DiscoveryCard key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

function DiscoveryCard({ item }: { item: DiscoveryItem }) {
  const colors = useColors();
  const headlineColor =
    item.timeTier.kind === "minute"
      ? colors.gold
      : item.timeTier.kind === "hour"
      ? colors.teal
      : colors.mutedForeground;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor:
            item.timeTier.kind === "minute"
              ? colors.gold + "55"
              : colors.border,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.themeEmoji}>{item.themeEmoji}</Text>
        <Text style={[styles.themeTitle, { color: colors.foreground }]}>
          {item.themeTitle}
        </Text>
        <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
          {happenedAgoLabel(item.happenedMinutesAgo)}
        </Text>
      </View>

      <View style={styles.photosRow}>
        <View style={styles.photoCol}>
          <Image source={{ uri: thumbUri(item.a.uri) }} style={styles.photo} />
          <View style={styles.flagRow}>
            <Text style={styles.flag}>{item.a.countryFlag}</Text>
            <Text
              style={[styles.country, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {item.a.country}
            </Text>
          </View>
        </View>

        <View style={styles.connectorCol}>
          <View
            style={[
              styles.connectorLine,
              { backgroundColor: colors.border },
            ]}
          />
          <View
            style={[
              styles.connectorBadge,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Icon name="zap" size={12} color={colors.teal} />
          </View>
          <View
            style={[
              styles.connectorLine,
              { backgroundColor: colors.border },
            ]}
          />
        </View>

        <View style={styles.photoCol}>
          <Image source={{ uri: thumbUri(item.b.uri) }} style={styles.photo} />
          <View style={styles.flagRow}>
            <Text style={styles.flag}>{item.b.countryFlag}</Text>
            <Text
              style={[styles.country, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {item.b.country}
            </Text>
          </View>
        </View>
      </View>

      {/* Three fixed-width chip slots so the layout stays uniform as the
          feed scrolls — time tier always left, geo tier always centre,
          echo count always right, regardless of label length. */}
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
          <Text style={styles.chipEmoji}>{item.timeTier.emoji}</Text>
          <Text
            style={[styles.chipText, { color: headlineColor }]}
            numberOfLines={1}
          >
            {item.timeTier.label}
          </Text>
        </View>
        <View
          style={[
            styles.chip,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={styles.chipEmoji}>{item.geoTier.emoji}</Text>
          <Text
            style={[styles.chipText, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {item.geoTier.label}
          </Text>
        </View>
        <View
          style={[
            styles.chip,
            item.echoStats.sameAllTime > 1
              ? {
                  backgroundColor: colors.teal + "1a",
                  borderColor: colors.teal + "44",
                }
              : { backgroundColor: "transparent", borderColor: "transparent" },
          ]}
        >
          {item.echoStats.sameAllTime > 1 && (
            <>
              <Text style={styles.chipEmoji}>🔁</Text>
              <Text
                style={[styles.chipText, { color: colors.teal }]}
                numberOfLines={1}
              >
                {item.echoStats.sameAllTime.toLocaleString()}{" "}
                {item.echoStats.sameAllTime === 1 ? "echo" : "echoes"}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function happenedAgoLabel(min: number) {
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function thumbUri(uri: string) {
  // The sample photos are already Unsplash URLs with size hints — keep
  // them small for the feed.
  if (uri.includes("?")) return uri.replace(/w=\d+/, "w=300");
  return uri + "?w=300";
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
    gap: 10,
  },
  themeEmoji: { fontSize: 18 },
  themeTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  timeAgo: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  photosRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  photoCol: { flex: 1, gap: 8, alignItems: "center" },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  flag: { fontSize: 16 },
  country: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  connectorCol: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  connectorLine: {
    width: 2,
    height: 20,
  },
  connectorBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
});
