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

interface ResolvedClip {
  url: string;
  label: string;
  genre: MusicGenre;
}

interface CardClips {
  a: ResolvedClip | null;
  b: ResolvedClip | null;
}

// Resolve a clip for a single photo: prefer its stored genre, fall
// back to a vibe suggested from theme + tags so we (almost) always
// have *something* to play. Returns null only when getGenre completely
// fails to resolve.
function resolvePhotoClip(
  photo: SamplePhoto,
  theme: string,
): ResolvedClip | null {
  const stored = photo.musicGenre;
  const storedMeta = stored ? getGenre(stored) : undefined;
  if (storedMeta) {
    const clip = pickClipForSeed(storedMeta.id, photo.uri);
    return { url: clip.url, label: storedMeta.label, genre: storedMeta.id };
  }
  const fallbackGenre = suggestGenre(theme, photo.tags);
  const fallbackMeta = getGenre(fallbackGenre);
  if (!fallbackMeta) return null;
  const clip = pickClipForSeed(fallbackMeta.id, photo.uri);
  return { url: clip.url, label: fallbackMeta.label, genre: fallbackMeta.id };
}

// Resolve clips for BOTH photos on a card. Discover plays them
// sequentially (left first, then right) so a card's full "duet" plays
// even if the user lingers without scrolling.
function resolveCardClips(item: DiscoveryItem): CardClips {
  return {
    a: resolvePhotoClip(item.a, item.theme),
    b: resolvePhotoClip(item.b, item.theme),
  };
}

// How long the left clip plays before auto-advancing to the right.
// Short enough that users feel the duet on a casual lingering scroll,
// long enough that the audio doesn't feel choppy.
const LEFT_CLIP_DURATION_MS = 7000;

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

  // Map each item to its resolved clips (both sides) once so scroll
  // callbacks don't recompute on every viewability tick.
  const clipsByItem = useMemo(() => {
    const m = new Map<string, CardClips>();
    for (const it of items) m.set(it.id, resolveCardClips(it));
    return m;
  }, [items]);

  // ── Audio: play the centered card's clip ────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which photo on the active card is currently sounding. Resets to
  // "a" whenever activeId changes (a fresh card always starts on the
  // left photo) and advances to "b" after LEFT_CLIP_DURATION_MS — or
  // sooner if the user keeps scrolling without leaving the card (see
  // onScroll handler below).
  const [playingSide, setPlayingSide] = useState<"a" | "b">("a");
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

  // Records the wall-clock moment activeId last changed. The scroll
  // handler consults this so a swipe that simultaneously changes the
  // active card AND fires onScroll doesn't immediately flip the
  // brand-new card to its right photo, skipping the left clip.
  const lastActiveChangeAtRef = useRef<number>(0);

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
      const nextId = (middle.item as DiscoveryItem).id;
      setActiveId((prev) => {
        // Reset to left whenever a new card takes over so each card
        // always begins its duet on its left photo.
        if (prev !== nextId) {
          setPlayingSide("a");
          lastActiveChangeAtRef.current = Date.now();
        }
        return nextId;
      });
    },
  ).current;

  // Auto-advance left → right after LEFT_CLIP_DURATION_MS so a user
  // who lingers on a single card still hears both halves of its duet.
  useEffect(() => {
    if (!focused || muted) return;
    if (!activeId || playingSide !== "a") return;
    const t = setTimeout(() => {
      setPlayingSide("b");
    }, LEFT_CLIP_DURATION_MS);
    return () => clearTimeout(t);
  }, [activeId, playingSide, focused, muted]);

  // Scroll-driven swap: as the user keeps scrolling within the same
  // card (e.g. a slow drag that doesn't quite move the centred card),
  // we treat that gesture as an explicit "show me the other one" and
  // jump straight to the right clip. Cheap and idempotent — once
  // we're on "b" we stop reacting until the active card changes.
  //
  // Settle window: a swipe that changes cards also produces dozens of
  // onScroll events. Without this guard, the very first onScroll after
  // the new card becomes active would force it straight to "b" and
  // skip the left clip — exactly the bug the duet is meant to avoid.
  // 450ms is long enough to outlast a normal momentum scroll yet short
  // enough that a deliberate "nudge to advance" gesture on the same
  // card still feels instant.
  const SCROLL_SETTLE_MS = 450;
  const onScrollAdvance = useCallback(() => {
    if (Date.now() - lastActiveChangeAtRef.current < SCROLL_SETTLE_MS) return;
    setPlayingSide((s) => (s === "a" ? "b" : s));
  }, []);

  // Initial-mount fallback. FlatList's onViewableItemsChanged is
  // unreliable on react-native-web and on cold mounts where no scroll
  // has happened yet — both perfectly common entry paths into the
  // Discover tab. Without this, the user sees no highlight and hears
  // no vibe clip until they manually nudge the feed. Default the
  // active card to the first item so the feature is alive on landing,
  // and let viewability take over once it does fire.
  useEffect(() => {
    if (activeId) return;
    if (!items.length) return;
    setActiveId(items[0].id);
    setPlayingSide("a");
  }, [activeId, items]);

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

  // Resolve the clip + side that should currently be playing on the
  // active card. Falls back to the other side if the preferred one
  // didn't resolve (rare — only when both stored genre AND suggestion
  // come up empty for that photo).
  const current = useMemo<
    { side: "a" | "b"; clip: ResolvedClip } | null
  >(() => {
    if (!activeId) return null;
    const card = clipsByItem.get(activeId);
    if (!card) return null;
    const preferred = card[playingSide];
    if (preferred) return { side: playingSide, clip: preferred };
    const other = playingSide === "a" ? card.b : card.a;
    if (other) return { side: playingSide === "a" ? "b" : "a", clip: other };
    return null;
  }, [activeId, clipsByItem, playingSide]);

  // Drive the singleton audio player from the resolved current clip +
  // focus. Focus is reactive state (not a ref) so re-entering the tab
  // triggers a fresh playClip() for the currently active card without
  // requiring the user to scroll.
  useEffect(() => {
    if (!focused) return;
    if (!current) {
      void pause();
      return;
    }
    void playClip(current.clip.url);
  }, [current, focused]);

  const onRefresh = () => {
    setRefreshing(true);
    setWindowKey(Date.now().toString());
    refreshCounts().finally(() => setRefreshing(false));
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const renderItem = useCallback(
    ({ item }: { item: DiscoveryItem }) => {
      const isActive = activeId === item.id;
      const card = clipsByItem.get(item.id);
      // Highlight the side that's currently emitting sound on the
      // active card. When muted we hide the highlight entirely so the
      // UI doesn't lie about audio.
      const activeSide =
        isActive && !muted && current ? current.side : null;
      const vibeLabel =
        isActive && !muted && current ? current.clip.label : null;
      // Show a faint "next up" hint on the other photo so the user
      // sees the duet structure before it auto-advances.
      const upcomingSide =
        isActive && !muted && current && card
          ? current.side === "a"
            ? card.b
              ? ("b" as const)
              : null
            : card.a
            ? ("a" as const)
            : null
          : null;
      return (
        <DiscoveryCard
          item={item}
          activeSide={activeSide}
          upcomingSide={upcomingSide}
          vibeLabel={vibeLabel}
        />
      );
    },
    [activeId, clipsByItem, muted, current],
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
        onScroll={onScrollAdvance}
        scrollEventThrottle={120}
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
  upcomingSide,
  vibeLabel,
}: {
  item: DiscoveryItem;
  /** Which photo (a or b) is currently emitting the vibe clip, or null. */
  activeSide: "a" | "b" | null;
  /** Which photo will play next on this card (the duet partner). */
  upcomingSide: "a" | "b" | null;
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
          isUpcoming={upcomingSide === "a"}
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
          isUpcoming={upcomingSide === "b"}
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
  isUpcoming,
  vibeLabel,
  colors,
}: {
  photo: SamplePhoto;
  isActive: boolean;
  isUpcoming: boolean;
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
          isUpcoming && {
            // Faint dashed teal ring on the duet partner so the user
            // sees what's coming next before the auto-advance kicks in.
            borderColor: colors.teal + "66",
            borderStyle: "dashed",
          },
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
        {isUpcoming ? (
          <View style={styles.upNextBadge}>
            <Text style={styles.upNextBadgeText}>up next</Text>
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
  upNextBadge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  upNextBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
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
