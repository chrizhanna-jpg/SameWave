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
  type LayoutChangeEvent,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
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
import {
  isMuted,
  markUserInteracted,
  onMuteChange,
  onUserInteracted,
  pause,
  playClip,
  setMuted,
} from "@/utils/audio";

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
// position-driven: as a card scrolls into view its left photo plays;
// once the card's centre crosses the viewport's centre, playback
// switches to the right photo. See onScroll handler below.
function resolveCardClips(item: DiscoveryItem): CardClips {
  return {
    a: resolvePhotoClip(item.a, item.theme),
    b: resolvePhotoClip(item.b, item.theme),
  };
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

  // Map each item to its resolved clips (both sides) once so scroll
  // callbacks don't recompute on every viewability tick.
  const clipsByItem = useMemo(() => {
    const m = new Map<string, CardClips>();
    for (const it of items) m.set(it.id, resolveCardClips(it));
    return m;
  }, [items]);

  // ── Audio: position-driven duet (live highlight, debounced audio) ───
  //
  // The active card is "the one whose top half or bottom half straddles
  // the viewport's vertical centre". Which photo plays is then a
  // function of the same scroll position: while the viewport centre is
  // in the upper half of the card, the LEFT photo plays; once it
  // crosses into the lower half, the RIGHT photo plays. When the card
  // leaves the viewport entirely, the next card takes over starting
  // from its left photo.
  //
  // Architecture, hard-won from two prior failed attempts:
  //   - Visual state (activeId, playingSide) updates SYNCHRONOUSLY on
  //     every scroll event. Re-rendering two cards (the new + previous
  //     active) is cheap, and the user expects the green highlight to
  //     track their finger in real time. Using functional setState with
  //     equality short-circuits means unchanged frames don't actually
  //     re-render.
  //   - Audio reload is the EXPENSIVE side-effect (network fetch +
  //     decode), and that's what we debounce — see the playback effect
  //     below. Fast scrolls through five cards in under a second still
  //     only end up loading the final card's MP3.
  //   - **Side hysteresis.** Right at the card midpoint, micro-jitter
  //     in scroll position would otherwise flip A↔B many times per
  //     second. We require the centre to cross the midpoint by ~8% of
  //     the card height before the side actually flips.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playingSide, setPlayingSide] = useState<"a" | "b">("a");
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  const [focused, setFocused] = useState(true);

  // Subscribe to the global mute state so toggling it elsewhere (e.g.
  // the match tab header) keeps this UI in sync.
  useEffect(() => onMuteChange(setMutedState), []);

  // Layout cache — populated by each card's onLayout. Keys are item
  // ids; values are {y, height} in FlatList content coordinates. Live
  // in a ref because layout can change without re-rendering and we
  // don't want every layout pass to trigger a state update.
  const cardLayoutsRef = useRef<Map<string, { y: number; height: number }>>(
    new Map(),
  );
  // FlatList's own visible height — used to compute the viewport centre
  // and the symmetric padding that lets the first / last cards centre
  // on screen rather than parking against the header / tab bar.
  const [listHeight, setListHeight] = useState(0);
  // Most-recent first card height we've observed. Used as a best-guess
  // for the symmetric padding before any card has reported its layout
  // yet. Updated as soon as the first card lays out.
  const [estCardHeight, setEstCardHeight] = useState(0);

  // Mirror state into refs so the scroll handler can read current
  // values without rebinding on every state change. Without this the
  // hysteresis logic and the commit shortcut would force every callback
  // to recreate, which defeats the debounce.
  const activeIdRef = useRef<string | null>(null);
  const playingSideRef = useRef<"a" | "b">("a");
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    playingSideRef.current = playingSide;
  }, [playingSide]);

  // 8% of the card height. Wide enough to ride out 60Hz scroll noise,
  // narrow enough that a deliberate centre-crossing still feels
  // instantaneous. Picked by feel — keep symmetric.
  const SIDE_HYSTERESIS = 0.08;

  // Pure resolver: given a scroll offset, return which card+side
  // should be active. Reads layout cache and the current side via
  // refs so the callback identity stays stable across state changes.
  const resolveActive = useCallback(
    (scrollY: number): { id: string | null; side: "a" | "b" } => {
      if (listHeight <= 0 || items.length === 0) {
        return { id: null, side: "a" };
      }
      const centerY = scrollY + listHeight / 2;
      let foundId: string | null = null;
      let foundMid = 0;
      let foundHeight = 0;
      let foundContains = false;
      let nearestDist = Infinity;
      for (const it of items) {
        const layout = cardLayoutsRef.current.get(it.id);
        if (!layout) continue;
        const top = layout.y;
        const bottom = layout.y + layout.height;
        const mid = layout.y + layout.height / 2;
        if (centerY >= top && centerY <= bottom) {
          foundId = it.id;
          foundMid = mid;
          foundHeight = layout.height;
          foundContains = true;
          break;
        }
        const d = Math.abs(centerY - mid);
        if (d < nearestDist) {
          nearestDist = d;
          foundId = it.id;
          foundMid = mid;
          foundHeight = layout.height;
        }
      }
      if (!foundId) return { id: null, side: "a" };
      // Normalised offset from card midpoint: -0.5 = top edge, 0 =
      // centre, +0.5 = bottom edge.
      const offset =
        foundHeight > 0 ? (centerY - foundMid) / foundHeight : 0;
      const sameCard = activeIdRef.current === foundId;
      const cur = sameCard ? playingSideRef.current : null;
      let side: "a" | "b";
      if (cur === "a") {
        // Stay on A unless we've clearly committed past midpoint.
        side = offset > SIDE_HYSTERESIS ? "b" : "a";
      } else if (cur === "b") {
        side = offset < -SIDE_HYSTERESIS ? "a" : "b";
      } else {
        // Brand-new active card: anything in upper half (or exactly
        // centred) plays A. Only commit to B once we're meaningfully
        // past the midpoint. Without this the very first paint, where
        // the first card sits *exactly* at viewport centre, would
        // resolve to B and the user would hear the wrong photo first.
        side = foundContains
          ? offset > SIDE_HYSTERESIS
            ? "b"
            : "a"
          : "a";
      }
      return { id: foundId, side };
    },
    [items, listHeight],
  );

  // Apply the resolver result. Functional setState short-circuits
  // unchanged values so unchanged frames cost nothing — meaning we can
  // safely run this on every onScroll event without over-rendering.
  const applyScrollPosition = useCallback(
    (scrollY: number) => {
      const next = resolveActive(scrollY);
      setActiveId((prev) => (prev === next.id ? prev : next.id));
      setPlayingSide((prev) => (prev === next.side ? prev : next.side));
    },
    [resolveActive],
  );

  const lastScrollYRef = useRef(0);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      lastScrollYRef.current = y;
      applyScrollPosition(y);
    },
    [applyScrollPosition],
  );

  const onScrollBeginDrag = useCallback(() => {
    // Touching the feed counts as the user opting in to audio.
    markUserInteracted();
  }, []);

  // First-paint settle: when the FlatList finishes its initial layout
  // we may have a non-zero scroll offset (paddingTop pushed content
  // down) and zero card layouts cached. As cards report layouts we
  // re-resolve so the active highlight materialises without requiring
  // a scroll gesture. Note we deliberately do NOT auto-play here —
  // that's still gated on the user interacting first (see audio.ts).
  const [layoutTick, setLayoutTick] = useState(0);
  useEffect(() => {
    if (listHeight <= 0) return;
    applyScrollPosition(lastScrollYRef.current);
  }, [applyScrollPosition, listHeight, layoutTick]);

  const onCardLayout = useCallback((id: string, e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    const prev = cardLayoutsRef.current.get(id);
    if (prev && prev.y === y && prev.height === height) return;
    cardLayoutsRef.current.set(id, { y, height });
    if (height > 0) {
      setEstCardHeight((cur) => (cur === 0 ? height : cur));
    }
    setLayoutTick((t) => t + 1);
  }, []);

  const onListLayout = useCallback((e: LayoutChangeEvent) => {
    setListHeight(e.nativeEvent.layout.height);
  }, []);

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
  // focus. Note: playClip itself silently no-ops until the user has
  // interacted at least once, so this effect is safe to fire on mount.
  //
  // The actual playClip() is debounced ~80ms. Visual state updates
  // every scroll frame, but we don't want to thrash the audio system
  // by reloading a new MP3 every time the highlight crosses a card —
  // a fast scroll through five cards would otherwise queue five
  // network fetches and audibly stutter. The cleanup cancels the
  // pending timer, so when the user lands on a stable card only that
  // card's clip actually loads. Pause is immediate (no debounce
  // needed when there's nothing to play).
  useEffect(() => {
    if (!focused) return;
    if (!current) {
      void pause();
      return;
    }
    const url = current.clip.url;
    const timer = setTimeout(() => {
      void playClip(url);
    }, 80);
    return () => clearTimeout(timer);
  }, [current, focused]);

  // Cold-start kick: the very first interaction (a mute toggle, a card
  // tap, even just touching the feed) opens the audio gate but won't
  // by itself re-fire the playback effect above — that effect only
  // re-runs when activeId/playingSide change. Without this, a user who
  // taps the speaker icon before scrolling would see the green border
  // appear but hear nothing until they actually moved the feed. So we
  // subscribe once: the moment the gate opens, manually push the
  // currently-resolved clip through playClip().
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    return onUserInteracted(() => {
      const c = currentRef.current;
      if (c) void playClip(c.clip.url);
    });
  }, []);

  const onRefresh = () => {
    markUserInteracted();
    setRefreshing(true);
    setWindowKey(Date.now().toString());
    refreshCounts().finally(() => setRefreshing(false));
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  const winDims = useWindowDimensions();

  // Symmetric padding so the FIRST card naturally lands centred in the
  // viewport on initial paint and the LAST card can scroll up to
  // centre too (rather than parking against the bottom tab bar).
  //
  // We need a sensible value on the very first render — before the
  // FlatList has reported its own height — otherwise paddingTop jumps
  // from 24 to ~190 once layout completes and every card visibly
  // shudders downward. Estimate the FlatList height from the window
  // dimensions (window minus our header (~120) and the bottom tab bar
  // (~80)), then refine once the real layout arrives.
  const estListHeight = useMemo(() => {
    const headerEst = topPadding + 80;
    const tabBarEst = bottomPadding + 60;
    return Math.max(300, winDims.height - headerEst - tabBarEst);
  }, [winDims.height, topPadding, bottomPadding]);
  const effectiveListHeight = listHeight > 0 ? listHeight : estListHeight;
  const centerPad = useMemo(() => {
    const h = estCardHeight > 0 ? estCardHeight : 320;
    return Math.max(16, Math.floor((effectiveListHeight - h) / 2));
  }, [effectiveListHeight, estCardHeight]);

  const renderItem = useCallback(
    ({ item }: { item: DiscoveryItem }) => {
      const isActive = activeId === item.id;
      // Highlight the side that's currently emitting sound on the
      // active card. When muted we hide the highlight entirely so the
      // UI doesn't lie about audio.
      const activeSide =
        isActive && !muted && current ? current.side : null;
      const vibeLabel =
        isActive && !muted && current ? current.clip.label : null;
      return (
        <View onLayout={(e) => onCardLayout(item.id, e)}>
          <DiscoveryCard
            item={item}
            cardClips={clipsByItem.get(item.id) ?? null}
            activeSide={activeSide}
            vibeLabel={vibeLabel}
          />
        </View>
      );
    },
    [activeId, muted, current, onCardLayout, clipsByItem],
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
            onPress={() => {
              markUserInteracted();
              setMuted(!muted);
            }}
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
              color={muted ? colors.mutedForeground : colors.green}
            />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        onLayout={onListLayout}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: centerPad,
            paddingBottom: centerPad + bottomPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={<MusicCredit colors={colors} />}
      />
    </View>
  );
}

// CC-BY 4.0 attribution for the vibe clips that play across Discover
// and Match. The license requires a visible credit; this is the
// quietest place we can put it without interrupting the feed.
function MusicCredit({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.creditWrap}>
      <Text style={[styles.creditText, { color: colors.mutedForeground }]}>
        Vibe clips by{" "}
        <Text
          onPress={() =>
            Linking.openURL("https://incompetech.com").catch(() => {})
          }
          style={[styles.creditLink, { color: colors.foreground }]}
        >
          Kevin MacLeod (incompetech.com)
        </Text>
        {" "}· licensed under CC BY 4.0
      </Text>
    </View>
  );
}

function DiscoveryCard({
  item,
  cardClips,
  activeSide,
  vibeLabel,
}: {
  item: DiscoveryItem;
  /** Resolved clips for both photos, used by per-photo tap navigation. */
  cardClips: CardClips | null;
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
      onPress={() => {
        markUserInteracted();
        router.push({
          pathname: "/echoes-theme/[theme]",
          params: { theme: item.theme, title: item.themeTitle, emoji: item.themeEmoji },
        });
      }}
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
          clip={cardClips?.a ?? null}
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
          clip={cardClips?.b ?? null}
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
  clip,
  isActive,
  vibeLabel,
  colors,
}: {
  photo: SamplePhoto;
  /** Resolved clip for THIS photo, used to swap audio in the viewer. */
  clip: ResolvedClip | null;
  isActive: boolean;
  vibeLabel: string | null;
  colors: ReturnType<typeof useColors>;
}) {
  // The full-resolution URL we hand to the fullscreen viewer. The
  // thumbUri() variant is fine for the feed but pixelates when blown
  // up, so request a wider Unsplash render here.
  const fullUri = fullSizeUri(photo.uri);

  // Tapping the photo opens it fullscreen and immediately starts its
  // clip via the viewer's own playClip call. We pass the photo's own
  // resolved clip (which is what plays when this side is highlighted on
  // the feed) so the viewer is consistent with the feed audio.
  const onTap = () => {
    markUserInteracted();
    router.push({
      pathname: "/photo-viewer",
      params: {
        uri: fullUri,
        clipUrl: clip?.url ?? "",
        vibeLabel: clip?.label ?? "",
        country: photo.country,
        countryFlag: photo.countryFlag,
      },
    });
  };

  return (
    <View style={styles.photoCol}>
      <Pressable
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel={`Open ${photo.country} photo fullscreen`}
        style={({ pressed }) => [
          styles.photoWrap,
          isActive && {
            borderColor: colors.green,
            shadowColor: colors.green,
          },
          isActive && styles.photoWrapActive,
          pressed && { opacity: 0.85 },
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
      </Pressable>
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

function fullSizeUri(uri: string) {
  // For the fullscreen viewer we want a much larger render so the
  // photo doesn't pixelate when blown up to device width.
  if (uri.includes("?")) return uri.replace(/w=\d+/, "w=1200");
  return uri + "?w=1200";
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
  creditWrap: {
    paddingTop: 18,
    paddingBottom: 6,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  creditText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  creditLink: {
    fontFamily: "Inter_600SemiBold",
    textDecorationLine: "underline",
  },
});
