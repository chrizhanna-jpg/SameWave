import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { OceanShimmer } from "@/components/OceanShimmer";
import { useColors } from "@/hooks/useColors";
import { buildDiscoveryFeed, type DiscoveryItem } from "@/data/discoveryFeed";
import { isSamplePhoto, type SamplePhoto } from "@/data/samplePhotos";
import { fetchEchoCountsByTheme } from "@/utils/api";
import { useApp } from "@/context/AppContext";
import {
  getGenre,
  pickClipForSeed,
  suggestGenre,
  type MusicGenre,
} from "@/data/musicLibrary";
import { isMuted, onMuteChange, pause, playClip, setMuted } from "@/utils/audio";

// Pick which side of the card carries the vibe clip + which clip plays.
// Prefer photo A if it has a stored genre, then B, then fall back to a
// suggestion derived from the theme + tags so cards always have *some*
// vibe to play. Returns null when neither photo can be resolved.
function resolveCardClip(
  item: DiscoveryItem,
): { side: "a" | "b"; url: string; label: string; genre: MusicGenre } | null {
  const candidates: { side: "a" | "b"; photo: SamplePhoto }[] = [
    { side: "a", photo: item.a },
    { side: "b", photo: item.b },
  ];
  // 1) Stored genre wins
  for (const { side, photo } of candidates) {
    const stored = photo.musicGenre;
    const meta = stored ? getGenre(stored) : undefined;
    if (meta) {
      const clip = pickClipForSeed(meta.id, photo.uri);
      return { side, url: clip.url, label: meta.label, genre: meta.id };
    }
  }
  // 2) Suggest from theme/tags on photo A — A is the "their photo" of
  //    the pair the same way the match flow treats it.
  const fallbackGenre = suggestGenre(item.theme, item.a.tags);
  const fallbackMeta = getGenre(fallbackGenre);
  if (!fallbackMeta) return null;
  const clip = pickClipForSeed(fallbackMeta.id, item.a.uri);
  return { side: "a", url: clip.url, label: fallbackMeta.label, genre: fallbackMeta.id };
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { seenPhotoKeys } = useApp();
  const [windowKey, setWindowKey] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // Same dedup ledger as Match — a card the user already swiped on in
  // Match has no business resurfacing here either, especially since the
  // Discover feed is the user's "did I miss anyone like me?" surface.
  const excludeKeys = useMemo(() => new Set(seenPhotoKeys), [seenPhotoKeys]);

  // Auto-rotate the feed every 60s so it visibly stays alive.
  useEffect(() => {
    const id = setInterval(() => {
      setWindowKey(Date.now().toString());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const baseItems = useMemo(
    () => buildDiscoveryFeed(14, windowKey, excludeKeys),
    [windowKey, excludeKeys],
  );

  // Real per-theme echo counts from the server. Refreshed on mount, on
  // pull-to-refresh, and whenever the auto-rotate ticks. The discover
  // feed itself is still synthesised (we don't have enough live volume
  // to fill 14 cards), but the echo count chip on each card now reflects
  // actual mutual echoes across all users for that theme.
  const [themeCounts, setThemeCounts] = useState<Map<string, number>>(new Map());
  const refreshCounts = useCallback(async () => {
    const themes = await fetchEchoCountsByTheme();
    setThemeCounts(new Map(themes.map((t) => [t.theme, t.count])));
  }, []);
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts, windowKey]);

  // Always pull the count from the server. Themes the server doesn't
  // mention are themes with zero mutual echoes — show 0, never the
  // synthetic sample value. The chip itself is hidden when the count
  // isn't > 1 (see DiscoveryCard) so 0/1 themes don't display the chip.
  const items = useMemo(
    () =>
      baseItems.map((item) => ({
        ...item,
        echoStats: {
          ...item.echoStats,
          sameAllTime: themeCounts.get(item.theme) ?? 0,
        },
      })),
    [baseItems, themeCounts],
  );

  // Map each item to its resolved clip once so scroll callbacks don't
  // recompute it on every viewability tick.
  const clipByItem = useMemo(() => {
    const m = new Map<string, ReturnType<typeof resolveCardClip>>();
    for (const it of items) m.set(it.id, resolveCardClip(it));
    return m;
  }, [items]);

  // ── Audio: play the centered card's clip ────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  const [focused, setFocused] = useState(true);

  // Subscribe to the global mute state so toggling it elsewhere (e.g.
  // the match tab header) keeps this UI in sync.
  useEffect(() => onMuteChange(setMutedState), []);

  // FlatList tells us which cards are visible; we pick the one nearest
  // the middle of the viewport as "active". A 60% threshold keeps the
  // active card stable as the user scrolls past partial neighbours.
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 120,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!viewableItems.length) {
        setActiveId(null);
        return;
      }
      // Prefer the item with the highest "visibility" position closest
      // to centre. ViewToken doesn't expose pixel offsets, so we just
      // take the middle of the viewable list — good enough for the
      // single-column feed.
      const middle = viewableItems[Math.floor(viewableItems.length / 2)];
      setActiveId((middle.item as DiscoveryItem).id);
    },
  ).current;

  // Pause whenever the tab loses focus; resume the active card on
  // re-focus. Without this, music keeps playing after the user
  // switches to Match or Profile.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        void pause();
      };
    }, []),
  );

  // Drive the singleton audio player from active card + focus. Focus
  // is reactive state (not a ref) so re-entering the tab triggers a
  // fresh playClip() for the currently active card without requiring
  // the user to scroll.
  useEffect(() => {
    if (!focused) return;
    if (!activeId) {
      void pause();
      return;
    }
    const clip = clipByItem.get(activeId);
    if (!clip) {
      void pause();
      return;
    }
    void playClip(clip.url);
  }, [activeId, clipByItem, focused]);

  const onRefresh = () => {
    setRefreshing(true);
    setWindowKey(Date.now().toString());
    refreshCounts().finally(() => setRefreshing(false));
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const renderItem = useCallback(
    ({ item }: { item: DiscoveryItem }) => {
      const resolved = clipByItem.get(item.id) ?? null;
      const isActive = activeId === item.id;
      return (
        <DiscoveryCard
          item={item}
          activeSide={isActive && !muted ? resolved?.side ?? null : null}
          vibeLabel={resolved?.label ?? null}
        />
      );
    },
    [activeId, clipByItem, muted],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              Right now, around the world
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              Live same-same moments from strangers everywhere
            </Text>
          </View>
          <Pressable
            onPress={() => setMuted(!muted)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute vibe clips" : "Mute vibe clips"}
            style={[
              styles.muteBtn,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Icon
              name={muted ? "volumeX" : "volume2"}
              size={16}
              color={muted ? colors.mutedForeground : colors.teal}
            />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
}

function DiscoveryCard({
  item,
  activeSide,
  vibeLabel,
}: {
  item: DiscoveryItem;
  /** Which photo (a or b) is currently emitting the vibe clip, or null. */
  activeSide: "a" | "b" | null;
  /** Human label of the playing vibe, e.g. "Joy". Null when no clip. */
  vibeLabel: string | null;
}) {
  const colors = useColors();
  const headlineColor =
    item.timeTier.kind === "minute"
      ? colors.gold
      : item.timeTier.kind === "hour"
      ? colors.teal
      : colors.mutedForeground;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push({
          pathname: "/echoes-theme/[theme]",
          params: { theme: item.theme, title: item.themeTitle, emoji: item.themeEmoji },
        })
      }
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
        <PhotoSlot
          photo={item.a}
          isActive={activeSide === "a"}
          vibeLabel={vibeLabel}
          colors={colors}
        />

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
          {item.echoStats.sameAllTime > 1 ? (
            <Text
              style={[styles.connectorCount, { color: colors.teal }]}
              numberOfLines={1}
            >
              {item.echoStats.sameAllTime.toLocaleString()}
            </Text>
          ) : null}
          <View
            style={[
              styles.connectorLine,
              { backgroundColor: colors.border },
            ]}
          />
        </View>

        <PhotoSlot
          photo={item.b}
          isActive={activeSide === "b"}
          vibeLabel={vibeLabel}
          colors={colors}
        />
      </View>

      {/* Two equal-width chip slots so the time + geo tiers always
          render at the same size on every card and never clip their
          labels. The echo count moved up to the connector badge between
          the photos. */}
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
      </View>
    </TouchableOpacity>
  );
}

function PhotoSlot({
  photo,
  isActive,
  vibeLabel,
  colors,
}: {
  photo: SamplePhoto;
  isActive: boolean;
  vibeLabel: string | null;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.photoCol}>
      <View
        style={[
          styles.photoWrap,
          isActive && {
            borderColor: colors.teal,
            shadowColor: colors.teal,
          },
          isActive && styles.photoWrapActive,
        ]}
      >
        <Image source={{ uri: thumbUri(photo.uri) }} style={styles.photo} />
        {isSamplePhoto(photo.uri) && (
          <View style={styles.sampleBadge} accessibilityLabel="Sample photo">
            <Icon name="globe" size={11} color="#ffffff" />
          </View>
        )}
        {isActive && vibeLabel ? (
          <View style={styles.vibeBadge}>
            <Icon name="volume2" size={10} color="#ffffff" />
            <Text style={styles.vibeBadgeText} numberOfLines={1}>
              {vibeLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.flagRow}>
        <Text style={styles.flag}>{photo.countryFlag}</Text>
        <Text
          style={[styles.country, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {photo.country}
        </Text>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerText: {
    flex: 1,
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
  muteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
    marginBottom: 14,
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
  photoWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "transparent",
  },
  photoWrapActive: {
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  sampleBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  vibeBadge: {
    position: "absolute",
    left: 5,
    bottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    maxWidth: "85%",
  },
  vibeBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
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
  connectorCount: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
    marginTop: 4,
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
