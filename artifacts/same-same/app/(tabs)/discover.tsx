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
import { markTabVisited } from "@/utils/tabVisits";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { MicBadge } from "@/components/MicBadge";
import { OceanShimmer } from "@/components/OceanShimmer";
import { PressableScale } from "@/components/PressableScale";
import { useColors } from "@/hooks/useColors";
import { buildDiscoveryFeed, type DiscoveryItem } from "@/data/discoveryFeed";
import { DISCOVER_A11Y } from "@/data/waveRippleGlossary";
import { StockPhotoWatermark } from "@/components/StockPhotoWatermark";
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
  pauseIfLease,
  pausePreview,
  playClip,
  setMuted,
} from "@/utils/audio";

interface ResolvedClip {
  url: string;
  label: string;
  genre: MusicGenre;
  // When the photo carries a custom voice clip, this overrides `url`
  // for actual playback. We keep the genre fields populated so the
  // (suppressed-on-discover) vibe label and per-genre styling still
  // resolve coherently elsewhere.
  customAudioUrl?: string;
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
    return {
      url: clip.url,
      label: storedMeta.label,
      genre: storedMeta.id,
      customAudioUrl: photo.customAudioUrl,
    };
  }
  const fallbackGenre = suggestGenre(theme, photo.tags);
  const fallbackMeta = getGenre(fallbackGenre);
  if (!fallbackMeta) return null;
  const clip = pickClipForSeed(fallbackMeta.id, photo.uri);
  return {
    url: clip.url,
    label: fallbackMeta.label,
    genre: fallbackMeta.id,
    customAudioUrl: photo.customAudioUrl,
  };
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

  // Auto-rotate the feed every 60s so it visibly stays alive — but
  // ONLY when the user is parked at the top of the feed. Re-shuffling
  // the items array mid-scroll re-renders the FlatList with different
  // cards at the same scroll offset, which feels like the page jumped
  // and the photo the user was looking at vanished.
  useEffect(() => {
    const id = setInterval(() => {
      if (lastScrollYRef.current > 0) return;
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
  // synthetic sample value. The card itself no longer renders the
  // count visually (the user cancelled the wave-count badge because
  // its underlying same-vibe / same-theme matching wasn't reliable),
  // but the count is still tracked in echoStats for downstream sort
  // ordering and any future per-card logic.
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
  // Architecture:
  //   - Visual state (activeId, playingSide) updates SYNCHRONOUSLY on
  //     every scroll event. Re-rendering two cards (the new + previous
  //     active) is cheap, and the user expects the green highlight to
  //     track their finger in real time. Functional setState with
  //     equality short-circuits means unchanged frames don't re-render.
  //   - Audio reload is the EXPENSIVE side-effect (network fetch +
  //     decode), so that's debounced ~80ms in the playback effect
  //     below. A fast flick through five cards only loads the final
  //     card's MP3.
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

  // Mirror state into refs so the scroll handler can read the current
  // values without rebinding on every state change. Without this the
  // hysteresis logic would force every callback to recreate, which
  // defeats the debounce.
  const activeIdRef = useRef<string | null>(null);
  const playingSideRef = useRef<"a" | "b">("a");
  // Scroll position at the moment the active card last changed.
  // Used by applyScrollPosition to compute "how far through this card
  // has the user scrolled" — see comment there.
  const entryScrollYRef = useRef(0);
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
  // should be active. Reads the layout cache and the current side via
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
  //
  // Important: this handler only updates the within-card LEFT/RIGHT
  // side. The active card itself is driven by FlatList's own
  // viewability tracker (see viewabilityConfigCallbackPairs below) —
  // which uses what's actually on screen rather than a "nearest
  // centre" guess. On tall preview windows multiple cards fit on
  // screen at once and "nearest centre" was jumping straight to card
  // 3 the instant the user scrolled. The viewability picker advances
  // card-by-card, which matches the user's mental model.
  //
  // Special case: "top of the feed" (scrollY <= 0) is a well-defined
  // starting state — first card, left photo. We stipulate it directly
  // so the first card is highlighted the moment the tab opens and
  // again every time the user scrolls back to the very top.
  const applyScrollPosition = useCallback(
    (scrollY: number) => {
      if (scrollY <= 0 && items.length > 0) {
        const firstId = items[0].id;
        setActiveId((prev) => (prev === firstId ? prev : firstId));
        setPlayingSide((prev) => (prev === "a" ? prev : "a"));
        return;
      }
      const id = activeIdRef.current;
      if (!id) return;
      const layout = cardLayoutsRef.current.get(id);
      const cardHeight =
        layout && layout.height > 0
          ? layout.height
          : estCardHeight > 0
            ? estCardHeight
            : 320;
      // Side flip is anchored to how far the user has scrolled SINCE
      // the active card became active — not absolute viewport-centre
      // vs card-centre. The viewability tracker only flags a new card
      // once it's 50% on screen, by which point absolute viewport
      // centre is already nearly at that card's midpoint, so the
      // very next scroll frame would flip side to "b" and the user
      // would barely see the left photo. Anchoring to entryScrollY
      // gives each card a symmetric A/B split: half a card height of
      // scrolling past entry = midpoint = side flip.
      const traveled = scrollY - entryScrollYRef.current;
      const progress = traveled / cardHeight;
      // Bias the LEFT→RIGHT flip ~1.5cm (≈57dp) EARLIER in the card
      // than the geometric midpoint so the right photo takes over
      // sooner as the user scrolls past the card. Symmetric
      // SIDE_HYSTERESIS still rides on top to prevent micro-jitter.
      const SIDE_FLIP_OFFSET_DP = 57;
      const flipPoint = 0.5 - SIDE_FLIP_OFFSET_DP / cardHeight;
      const cur = playingSideRef.current;
      let next: "a" | "b";
      if (cur === "a") {
        next = progress > flipPoint + SIDE_HYSTERESIS ? "b" : "a";
      } else {
        next = progress < flipPoint - SIDE_HYSTERESIS ? "a" : "b";
      }
      if (next !== cur) {
        playingSideRef.current = next;
        setPlayingSide(next);
      }
    },
    [items, estCardHeight],
  );

  // Viewability-driven active card picker. FlatList tells us which
  // items are actually visible on screen; we pick the topmost one
  // (smallest index) as the active card. This advances card-by-card
  // as the user scrolls — even on wheel-scroll jumps or tall preview
  // viewports where several cards fit at once — instead of leaping
  // ahead based on viewport-centre math.
  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: 50,
        minimumViewTime: 0,
      },
      onViewableItemsChanged: ({
        viewableItems,
      }: {
        viewableItems: Array<{
          item: DiscoveryItem;
          index: number | null;
          isViewable: boolean;
        }>;
      }) => {
        if (lastScrollYRef.current <= 0) return; // top-of-feed lock owns this
        const visible = viewableItems
          .filter((v) => v.isViewable && v.index !== null)
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const topmost = visible[0];
        if (!topmost) return;
        const id = topmost.item.id;
        if (activeIdRef.current === id) return;
        // Detect scroll direction by comparing the new active card's
        // index to the previous one's. Scrolling DOWN enters a card
        // from its top → start on LEFT (side "a"). Scrolling UP enters
        // a card from its bottom → start on RIGHT (side "b"), so the
        // right photo plays as the user scrolls back up through the
        // card before flipping to the left photo at midpoint.
        const newIndex = topmost.index ?? 0;
        const prevId = activeIdRef.current;
        const prevIndex =
          prevId !== null ? items.findIndex((it) => it.id === prevId) : -1;
        const scrollingUp = prevIndex >= 0 && newIndex < prevIndex;
        const layout = cardLayoutsRef.current.get(id);
        const cardHeight =
          layout && layout.height > 0
            ? layout.height
            : estCardHeight > 0
              ? estCardHeight
              : 320;
        const startSide: "a" | "b" = scrollingUp ? "b" : "a";
        // Seed entryScrollY so applyScrollPosition's progress math
        // starts at the right end of the card. For "a" we start at
        // progress 0 (card top), so entry = current scroll. For "b"
        // we start at progress 1 (card bottom), so entry = current
        // scroll - cardHeight.
        const entryY = scrollingUp
          ? lastScrollYRef.current - cardHeight
          : lastScrollYRef.current;
        // Sync the refs IMMEDIATELY (not via the effect that mirrors
        // state → ref on the next render). onScroll fires right after
        // viewability — if activeIdRef still points at the old card,
        // applyScrollPosition computes the wrong offset and flips
        // side incorrectly before the new card's state update lands.
        activeIdRef.current = id;
        playingSideRef.current = startSide;
        entryScrollYRef.current = entryY;
        setActiveId(id);
        setPlayingSide(startSide);
      },
    },
  ]).current;

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

  // First-card seed: as soon as we have items, point activeId at the
  // first one so the green highlight (and the audio, once the gate
  // opens) lands on card 1 immediately. This is independent of the
  // FlatList layout pass — without it, there's a perceptible window
  // between mount and the first card lighting up that depended on
  // layout callbacks firing in the right order. The resolver still
  // takes over the moment the user actually scrolls.
  useEffect(() => {
    if (activeId !== null) return;
    if (items.length === 0) return;
    if (lastScrollYRef.current !== 0) return;
    setActiveId(items[0].id);
  }, [items, activeId]);

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
  // Lease handed back by the audio singleton for the most recent
  // clip THIS screen started. The unfocus cleanup uses it with
  // pauseIfLease() so we only pause audio we actually own — if the
  // user tabbed away to a screen that has already started its own
  // playback, our blur cleanup must NOT race-pause that fresh clip.
  const playLeaseRef = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Tapping the Discover tab counts as an interaction — open the
      // audio gate immediately so the first card's right-side clip
      // starts playing the moment the user lands on the feed, without
      // requiring them to scroll first.
      markUserInteracted();
      markTabVisited("discover");
      return () => {
        setFocused(false);
        void pauseIfLease(playLeaseRef.current);
        // Also pause any voice-clip preview the user kicked off via a
        // mic badge tap. `pausePreview()` is lease-aware and only
        // touches the singleton player if the active clip was started
        // by `togglePreview()`, so it won't disturb feed background
        // music (handled by pauseIfLease above).
        void pausePreview();
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
  // No JS-side debounce: we let playClip() fire immediately on every
  // change to `current` so a midpoint side flip swaps audio the
  // instant the user crosses it. audio.ts already protects itself
  // from rapid scrolls via its `playToken` mechanism — fast-changing
  // calls just abort each other's in-flight loads, so only the final
  // settled card actually finishes loading. Adding a setTimeout on
  // top would only delay the first audible response after a flip
  // (which is exactly what the user complained about).
  useEffect(() => {
    if (!focused) return;
    if (!current) {
      void pause();
      return;
    }
    // Prefer the photo's custom voice clip over the genre-resolved
    // music clip so feed autoplay matches the badge tap + photo tap
    // paths (which both prefer customAudioUrl).
    playLeaseRef.current = playClip(
      current.clip.customAudioUrl ?? current.clip.url,
    );
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
      // Capture the lease here too — without this, the focus blur
      // cleanup's pauseIfLease() would no-op against a stale lease
      // and Discover's audio would keep playing after a tab switch.
      if (c) {
        playLeaseRef.current = playClip(
          c.clip.customAudioUrl ?? c.clip.url,
        );
      }
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
          <PressableScale
            onPress={() => {
              markUserInteracted();
              setMuted(!muted);
            }}
            haptic="selection"
            scaleTo={0.92}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute vibe clips" : "Mute vibe clips"}
            style={[
              styles.muteBtn,
              {
                backgroundColor: colors.cardElevated,
              },
              colors.shadows.sm,
            ]}
          >
            <Icon
              name={muted ? "volumeX" : "volume2"}
              size={16}
              color={muted ? colors.mutedForeground : colors.green}
            />
          </PressableScale>
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
            // Extra (estCardHeight || 320) of padding ensures the LAST
            // card has the same scroll room every other card has — i.e.
            // the user can scroll a full half-card past the moment it
            // becomes the active card and trigger the LEFT→RIGHT side
            // flip. Without it, the very last right-hand photo is
            // unreachable because the FlatList runs out of content
            // before the user can scroll past entry+midpoint.
            paddingBottom:
              centerPad + bottomPadding + (estCardHeight > 0 ? estCardHeight : 320),
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        scrollEventThrottle={16}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
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
      {/* Card title — mirrors the share-card title style so the
          discover feed reads as a feed of Ripple and Wave moments
          between two individuals.

          - Ripple cards: [ripple icon] Ripple [ripple icon] in the
            foreground color, matching the Ripple share card in
            reveal.tsx (a one-way swipe match).
          - Wave  cards: [wave icon] Wave [wave icon] in teal,
            matching the Wave share card in echo-pair.tsx (mutual
            reciprocation between both sides).

          The previous "WAVE N" count was driven by same-vibe / same-
          theme matching which the user explicitly cancelled — the
          underlying matching can't be trusted to produce a meaningful
          count, so we surface the interaction TYPE instead. */}
      {item.kind === "wave" ? (
        <View
          style={styles.shareTitleRow}
          accessibilityLabel={DISCOVER_A11Y.wave}
        >
          {/* "wave-glyph" is the standalone wave artwork (no wordmark).
              Same icon and same size used by the Wave share-card title
              row in echo-pair.tsx so the discovery card and the share
              card stay visually identical. */}
          <Icon name="wave-glyph" size={22} color={colors.teal} />
          <Text style={[styles.shareTitle, { color: colors.teal }]}>
            Wave
          </Text>
          <Icon name="wave-glyph" size={22} color={colors.teal} />
        </View>
      ) : (
        <View
          style={styles.shareTitleRow}
          accessibilityLabel={DISCOVER_A11Y.ripple}
        >
          <Icon name="ripple" size={18} color={colors.foreground} />
          <Text style={[styles.shareTitle, { color: colors.foreground }]}>
            Ripple
          </Text>
          <Icon name="ripple" size={18} color={colors.foreground} />
        </View>
      )}
      {/* When the match happened — small ambient subtitle. Recency
          is also conveyed by the time-tier chip below, but the
          exact "X minutes ago" tells the user how live the moment
          itself is. */}
      <Text style={[styles.shareTitleAgo, { color: colors.mutedForeground }]}>
        {happenedAgoLabel(item.happenedMinutesAgo)}
      </Text>

      <View style={styles.photosRow}>
        <PhotoSlot
          photo={item.a}
          clip={cardClips?.a ?? null}
          isActive={activeSide === "a"}
          vibeLabel={vibeLabel}
          colors={colors}
        />
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
          labels. */}
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
  // clip via the viewer's own playClip call. If this photo carries a
  // custom voice clip, prefer THAT over the genre-resolved music clip
  // — both the mic badge tap (here on the feed) and the photo tap
  // (which opens the viewer) should preview the same audio.
  const onTap = () => {
    markUserInteracted();
    const useCustom = !!photo.customAudioUrl;
    router.push({
      pathname: "/photo-viewer",
      params: {
        uri: fullUri,
        clipUrl: useCustom ? photo.customAudioUrl ?? "" : clip?.url ?? "",
        vibeLabel: useCustom ? "voice clip" : clip?.label ?? "",
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
        {isSamplePhoto(photo.uri) ? <StockPhotoWatermark size="md" /> : null}
        {/* Mic badge for any real (non-sample) photo that carries a
            custom voice clip. Today the discovery feed is dominated by
            synthetic SamplePhotos which never set customAudioUrl, so
            this gate is mostly defensive — it ensures the badge will
            light up automatically once real user photos start flowing
            into the feed. */}
        {photo.customAudioUrl ? (
          <View style={styles.photoMicBadge}>
            <MicBadge audioUrl={photo.customAudioUrl} size="sm" />
          </View>
        ) : null}
        {/* Hide the genre vibe badge when a custom voice clip exists —
            the mic badge in the same bottom-left corner is what's
            actually playing for this card, so showing both would be
            visually noisy and contradictory. */}
        {isActive && vibeLabel && !photo.customAudioUrl ? (
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
          style={[styles.country, { color: colors.teal }]}
          numberOfLines={2}
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
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    marginBottom: 14,
  },
  // Centered Ripple/Wave title row that mirrors the share-card title
  // styling on reveal.tsx (Ripple) and echo-pair.tsx (Wave). Smaller
  // type than the actual share card since it lives inside a feed card.
  shareTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  // "5 minutes ago" subtitle directly under the share-card title.
  shareTitleAgo: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: -4,
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
  photoMicBadge: {
    // Bottom-left matches the MicBadge visual convention used on every
    // other surface (echo-pair, match, echoes-theme). The sibling
    // vibeBadge is suppressed when customAudioUrl is set, so there is
    // no overlap in this corner.
    position: "absolute",
    bottom: 5,
    left: 5,
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
    alignItems: "center",
    gap: 4,
    paddingTop: 2,
  },
  flag: { fontSize: 28, lineHeight: 32 },
  country: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: 0.2,
    alignSelf: "stretch",
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
