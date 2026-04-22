import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon } from "@/components/Icon";
import { MatchHearts } from "@/components/MatchHearts";
import { MatchFlash } from "@/components/MatchFlash";
import { EchoLogo } from "@/components/EchoLogo";
import { OceanShimmer } from "@/components/OceanShimmer";
import { expandToVibe } from "@/utils/interests";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  SAMPLE_PHOTOS,
  DAILY_CHALLENGES,
  getTodaysChallenge,
  getThemeChain,
  TAG_LIBRARY,
  generateSyntheticCandidates,
  ENABLE_SYNTHETIC_MATCHES,
  type SamplePhoto,
} from "@/data/samplePhotos";
import { fetchCandidates, votePhoto, fetchMatchStats, markPhotosSeen } from "@/utils/api";
import {
  getGenre,
  pickClipForSeed,
  suggestGenre,
  type MusicGenre,
} from "@/data/musicLibrary";
import {
  isMuted as audioIsMuted,
  onMuteChange,
  pause as pauseAudio,
  playClip,
  setMuted as setAudioMuted,
  stop as stopAudio,
} from "@/utils/audio";
import { sampleMatchStats } from "@/utils/sampleStats";
import { flagFor, nameFor } from "@/data/countries";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import { getGeoTier } from "@/utils/celebrations";
import type { Match } from "@/context/AppContext";
import { photoKey } from "@/utils/photoKey";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = width * 0.28;

// Candidate scoring: shared tags weigh most, then same theme, then adjacent
// theme, then recency. Returns scored unseen candidates sorted high → low.
type Scored = {
  photo: typeof SAMPLE_PHOTOS[number];
  score: number;
  sharedTags: string[];
  inChain: boolean;
};

function scoreCandidates(
  preferredTheme: string,
  myTags: string[],
  excludeKeys: Set<string>,
  extraPool: SamplePhoto[] = [],
): Scored[] {
  const chain = getThemeChain(preferredTheme);
  const chainIndex = (theme: string) => {
    const i = chain.indexOf(theme);
    return i === -1 ? -1 : i;
  };
  const myTagSet = new Set(myTags);

  // Production: pool is REAL candidates only (extraPool comes from
  // /api/photos/candidates, populated by SwipeScreen below).
  // Dev/Expo Go: blend curated SAMPLE_PHOTOS + synthetic generator + any
  // real candidates the dev server happens to have. Synthetic generation is
  // hard-gated by ENABLE_SYNTHETIC_MATCHES so a release build can never
  // accidentally show invented matches.
  const synthetic = generateSyntheticCandidates(preferredTheme, myTags, 24, excludeKeys);
  const pool: SamplePhoto[] = ENABLE_SYNTHETIC_MATCHES
    ? [...SAMPLE_PHOTOS, ...synthetic, ...extraPool]
    : extraPool;

  // Excluded keys + per-call key dedupe. We compare on the stable
  // photoKey (not the raw URI) so two URIs pointing at the same image
  // — different ?w= params, trailing slashes, etc. — never both pass.
  const seenInPool = new Set<string>();
  const candidates: Scored[] = pool
    .filter((p) => {
      const k = photoKey(p.uri);
      if (!k) return false;
      if (excludeKeys.has(k)) return false;
      if (seenInPool.has(k)) return false;
      seenInPool.add(k);
      return true;
    })
    .map((p) => {
      const sharedTags = p.tags.filter((t) => myTagSet.has(t));
      const idx = chainIndex(p.theme);
      const inChain = idx >= 0;
      const sameTheme = p.theme === preferredTheme;
      // SCORING — theme dominates. The previous weights had per-tag = 6
      // and same-theme = 4, which meant a single weak vibe match (e.g.
      // "warm" appearing on both a hand photo and a kayak) outranked
      // actual same-subject photos. The user's chosen theme ("Your
      // hands", "Your morning", etc.) is by far the strongest signal we
      // have without true visual ML, so a same-theme photo with zero tag
      // overlap now outranks a different-theme photo sharing one tag.
      const score =
        (sameTheme ? 10 : 0) +
        sharedTags.length * 4 +
        (inChain && !sameTheme ? Math.max(0, 3 - idx * 1) : 0) +
        Math.max(0, 0.6 - p.minutesAgo / 4320); // up to +0.6, decays over 3 days
      return { photo: p, score, sharedTags, inChain };
    })
    // Hard floor — only show genuinely related photos. A candidate must
    // satisfy at least one of:
    //   (a) same theme as the user's photo  ← the dominant signal
    //   (b) ≥ 2 shared tags                 ← multi-tag overlap is real
    //   (c) chain-adjacent AND ≥ 1 shared tag (mild bleed between
    //       neighbouring themes is OK only if there's also a tag link)
    // Single-tag-only crossovers (the kayak-with-"warm" failure mode)
    // are dropped outright.
    .filter((c) => {
      const sameTheme = c.photo.theme === preferredTheme;
      if (sameTheme) return true;
      if (c.sharedTags.length >= 2) return true;
      if (c.inChain && c.sharedTags.length >= 1) return true;
      return false;
    })
    .sort((a, b) => b.score - a.score);
  return candidates;
}

// Pick the next candidate. Prefers tag overlap, then same theme, then adjacent
// themes, then recency. Within the top tier, adds a touch of randomness so
// repeated swipes don't feel deterministic. Recycles when seen list exhausts.
function getTheirPhoto(
  preferredTheme: string,
  myTags: string[],
  excludeKeys: Set<string>,
  currentKey: string | undefined,
  extraPool: SamplePhoto[] = [],
): { photo: typeof SAMPLE_PHOTOS[number]; matchedTheme: string; sharedTags: string[] } | null {
  const ranked = scoreCandidates(preferredTheme, myTags, excludeKeys, extraPool);
  if (ranked.length === 0) {
    // Pool genuinely exhausted for this session. We deliberately do NOT
    // recycle already-seen photos — the swipe screen shows a "you've
    // seen everything" state until new candidates appear (a fresh
    // upload, the backend serving more real photos, etc.).
    if (!ENABLE_SYNTHETIC_MATCHES) return null;
    // Dev only: one last synth attempt with the current key folded into
    // the exclusion set. generateSyntheticCandidates already filters by
    // seenKeys, so any photo it returns is guaranteed-fresh.
    const widened = currentKey
      ? new Set([...excludeKeys, currentKey])
      : excludeKeys;
    const fresh = generateSyntheticCandidates(preferredTheme, myTags, 24, widened);
    if (fresh.length === 0) return null;
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    return {
      photo: pick,
      matchedTheme: pick.theme,
      sharedTags: pick.tags.filter((t) => myTags.includes(t)),
    };
  }
  // Tight top-tier window (0.6 pts) so we only randomise between
  // genuinely-comparable matches, never reach for the next-best-thing.
  const topScore = ranked[0].score;
  let topTier = ranked.filter((c) => c.score >= topScore - 0.6).slice(0, 6);
  // Avoid picking the literal current photo if other top-tier options exist.
  if (currentKey && topTier.length > 1) {
    const filtered = topTier.filter((c) => photoKey(c.photo.uri) !== currentKey);
    if (filtered.length > 0) topTier = filtered;
  }
  const pick = topTier[Math.floor(Math.random() * topTier.length)];
  return {
    photo: pick.photo,
    matchedTheme: pick.photo.theme,
    sharedTags: pick.sharedTags,
  };
}

export default function SwipeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    streakCount,
    myPhotos,
    addMatch,
    refreshEchoes,
    myCountryCode,
    myCountryName,
    myCountryFlag,
    seenPhotoKeys,
    markPhotoSeen,
    resetSeenPhotos,
    primeSeenFromCandidates,
  } = useApp();
  // DEV-only debug pill — visibility-toggled state lives at the top
  // of the component so the floating button rendered at the very end
  // of the JSX tree can read/write it.
  const [debugOpen, setDebugOpen] = useState(false);

  // Single source of truth for "photos already swiped on" — comes from the
  // persistent ledger in AppContext (backed by AsyncStorage, hydrated from
  // both the explicit ledger and the existing match history).
  const seenSet = React.useMemo(() => new Set(seenPhotoKeys), [seenPhotoKeys]);
  const seenSetRef = useRef(seenSet);
  seenSetRef.current = seenSet;
  const todaysChallenge = getTodaysChallenge();

  // Today's photo only — if the user's most recent upload is from a
  // previous UTC day (yesterday's challenge or older), we don't pre-load
  // it into the matching screen. They get the upload prompt instead, so
  // each session starts fresh against today's challenge.
  const todaysPhoto = React.useMemo(() => {
    if (myPhotos.length === 0) return undefined;
    const todayUtcDay = Math.floor(Date.now() / 86_400_000);
    const p = myPhotos[0];
    const uploadedUtcDay = Math.floor(
      new Date(p.uploadedAt).getTime() / 86_400_000,
    );
    return uploadedUtcDay === todayUtcDay ? p : undefined;
  }, [myPhotos]);

  // User's photo is LOCKED for the session — only changes when they upload a new one
  const myPhotoData = React.useMemo<{ uri: string; uploadedAt: string; theme: string; tags: string[] }>(() => {
    if (todaysPhoto) {
      return {
        uri: todaysPhoto.uri,
        uploadedAt: todaysPhoto.uploadedAt,
        theme: todaysPhoto.theme,
        tags: todaysPhoto.tags ?? [],
      };
    }
    const sample = SAMPLE_PHOTOS[0];
    return {
      uri: sample.uri,
      uploadedAt: simulatedPostedAt(5).toISOString(),
      theme: sample.theme,
      tags: sample.tags,
    };
  }, [todaysPhoto]);

  const myPhotoUri = myPhotoData.uri;
  const activeTheme = myPhotoData.theme;
  const myTags = myPhotoData.tags;
  // The user's theme is freeform — find a matching daily challenge for the
  // emoji if possible, otherwise default to ✨ and show the raw theme text.
  const themeMeta = DAILY_CHALLENGES.find(
    (c) => c.id === activeTheme || c.title.toLowerCase() === activeTheme,
  );
  const themeEmoji = themeMeta?.emoji ?? "✨";
  const themeTitle = themeMeta?.title ?? activeTheme;

  // Stable signature of the user's tag list — included in deps so re-uploading
  // the same URI/theme but with different tags re-seeds the candidate pool.
  const myTagsKey = React.useMemo(() => [...myTags].sort().join("|"), [myTags]);

  // Stable photoKey for the user's own photo — never offered as a match.
  const myPhotoKey = React.useMemo(() => photoKey(myPhotoUri), [myPhotoUri]);

  // Per-mount session override: the "Show photos I've seen" button flips
  // this true so the next pick ignores the persistent ledger. Reset on
  // every photo / theme / tags change so a fresh upload starts clean.
  const bypassSeenRef = useRef(false);

  // Per-mount log of keys we've actually displayed since mount. Used to
  // tell apart "current photo was already in the ledger before mount"
  // (which means we showed a stale candidate while waiting for hydration)
  // from "current photo was just marked seen by us" (no action needed).
  const sessionDisplayedRef = useRef<Set<string>>(new Set());

  // Build the exclusion set passed into scoreCandidates / generator: the
  // user's own photo + the persistent ledger. When bypassSeenRef is true
  // (the "Show photos I've seen" override) we drop the ledger so every
  // photo is eligible again.
  const buildExcludeKeys = useCallback(
    (extra?: string): Set<string> => {
      const keys = new Set<string>();
      if (myPhotoKey) keys.add(myPhotoKey);
      if (!bypassSeenRef.current) {
        for (const k of seenSetRef.current) keys.add(k);
      }
      if (extra) keys.add(extra);
      return keys;
    },
    [myPhotoKey],
  );

  // When the persistent ledger hydrates AFTER mount, the current card
  // might be a photo the user already swiped on in a previous session.
  // Detect that and re-pick once. We compare against sessionDisplayedRef
  // so we never re-pick a card we just placed (which would loop because
  // mark-on-display adds it to the ledger immediately).
  useEffect(() => {
    const currentUri = theirPhotoRef.current?.uri;
    if (!currentUri) return;
    const k = photoKey(currentUri);
    if (!k) return;
    if (sessionDisplayedRef.current.has(k)) return;
    if (!seenSet.has(k)) return;
    const next = getTheirPhoto(
      activeThemeRef.current,
      myTagsRef.current,
      buildExcludeKeys(k),
      k,
      realPoolRef.current,
    );
    if (next) {
      setTheirPhoto(next.photo);
      setMatchedTheme(next.matchedTheme);
      setSharedTags(next.sharedTags);
      setNoMore(false);
    }
  }, [seenSet, buildExcludeKeys]);

  // Real candidates from the backend. Empty until the first fetch resolves;
  // SwipeScreen still renders something via SAMPLE_PHOTOS in dev / a graceful
  // empty state in production.
  const [realPool, setRealPool] = useState<SamplePhoto[]>([]);
  // URI → backend photo ID, so handleSwipe can post the verdict to the right
  // row. Populated when realPool is loaded; missing entries (e.g. curated
  // SAMPLE_PHOTOS, synthetic candidates) skip the API call cleanly.
  const realPhotoIdsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchCandidates({ theme: activeTheme, tags: myTags, limit: 24 })
      .then((cands) => {
        if (cancelled) return;
        const ids = new Map<string, string>();
        const mapped: SamplePhoto[] = cands.map((c) => {
          const code = (c.countryCode ?? "ZZ").toUpperCase();
          const minutesAgo = Math.max(
            1,
            Math.round((Date.now() - new Date(c.createdAt).getTime()) / 60000),
          );
          ids.set(c.uri, c.id);
          return {
            id: `live-${c.id}`,
            uri: c.uri,
            country: nameFor(code) ?? "Somewhere",
            countryCode: code,
            countryFlag: flagFor(code),
            theme: c.theme || activeTheme,
            minutesAgo,
            tags: c.tags,
            musicGenre: c.musicGenre ?? undefined,
          };
        });
        realPhotoIdsRef.current = ids;
        // Prime the local seen ledger with any candidates whose backend
        // ID is in the server-side seen set. Lets cross-device dedup
        // reflect immediately after install instead of waiting for the
        // user to swipe past those cards locally.
        primeSeenFromCandidates(
          cands.map((c) => ({ id: c.id, uri: c.uri })),
        );
        setRealPool(mapped);
      })
      .catch(() => {
        if (!cancelled) setRealPool([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTheme, myTagsKey]);

  const realPoolRef = useRef<SamplePhoto[]>(realPool);
  realPoolRef.current = realPool;

  // A placeholder rendered before the first real candidate arrives (and as
  // a sentinel when the production pool runs dry — see `noMore` below).
  const PLACEHOLDER_PHOTO: SamplePhoto = React.useMemo(
    () => ({
      id: "placeholder",
      uri: myPhotoUri, // re-use user's photo as a neutral background
      country: "",
      countryCode: "",
      countryFlag: "",
      theme: activeTheme,
      minutesAgo: 0,
      tags: [],
    }),
    [myPhotoUri, activeTheme],
  );
  const initial = React.useMemo(
    () =>
      getTheirPhoto(
        activeTheme,
        myTags,
        // Exclude the user's own photo AND every photo they've ever
        // reacted to (the persistent ledger). The post-mount effect above
        // re-picks if hydration adds keys that weren't in the set yet
        // when this initial pick ran.
        buildExcludeKeys(),
        undefined,
        realPool,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [theirPhoto, setTheirPhoto] = useState(initial?.photo ?? PLACEHOLDER_PHOTO);
  const [matchedTheme, setMatchedTheme] = useState<string>(initial?.matchedTheme ?? "");
  const [sharedTags, setSharedTags] = useState<string[]>(initial?.sharedTags ?? []);
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  // True when the candidate pool is exhausted (production: no real photos
  // matched the user's theme/tags and we can't fall back to fakes).
  const [noMore, setNoMore] = useState<boolean>(initial == null);
  // Inline celebration shown right on the swipe card after a "same same"
  // verdict. Replaces the older auto-navigate-to-/reveal flow so swipes
  // stay in flow. The full /reveal screen remains accessible via the
  // overlay's "Open" pill (and from My Journey).
  const [flashMatch, setFlashMatch] = useState<Match | null>(null);

  // Refs mirror state so callbacks stay stable and read latest values
  // without triggering re-creation (which previously caused stale closures
  // inside in-flight Animated callbacks → "stuck on same photo").
  const theirPhotoRef = useRef(theirPhoto);
  theirPhotoRef.current = theirPhoto;
  const activeThemeRef = useRef(activeTheme);
  activeThemeRef.current = activeTheme;
  const myTagsRef = useRef(myTags);
  myTagsRef.current = myTags;
  const myPhotoUriRef = useRef(myPhotoUri);
  myPhotoUriRef.current = myPhotoUri;
  const isAnimatingOutRef = useRef(false);

  const pan = useRef(new Animated.ValueXY()).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const sameOpacity = useRef(new Animated.Value(0)).current;

  // When the user uploads a new photo (which may carry a new theme/tags),
  // reset the candidate pool so we immediately match against the new
  // context. The persistent ledger still applies — only the per-session
  // bypass flag is reset.
  useEffect(() => {
    bypassSeenRef.current = false;
    sessionDisplayedRef.current = new Set();
    const next = getTheirPhoto(
      activeTheme,
      myTags,
      buildExcludeKeys(),
      undefined,
      realPool,
    );
    if (next) {
      setTheirPhoto(next.photo);
      setMatchedTheme(next.matchedTheme);
      setSharedTags(next.sharedTags);
      setNoMore(false);
    } else {
      setNoMore(true);
    }
    isAnimatingOutRef.current = false;
    pan.setValue({ x: 0, y: 0 });
    cardScale.setValue(1);
    sameOpacity.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPhotoUri, activeTheme, myTagsKey]);

  // Mark the currently-displayed photo as seen the moment it lands on
  // screen. This closes the swipe-right race window — the photo behind
  // the celebration flash is already in the ledger, so a backgrounded
  // app or interrupted celebration can't resurface it. Skipping the
  // placeholder (which re-uses the user's own photo) prevents a self-
  // entry from polluting the ledger.
  useEffect(() => {
    if (!theirPhoto?.uri) return;
    const k = photoKey(theirPhoto.uri);
    if (!k || k === myPhotoKey) return;
    sessionDisplayedRef.current.add(k);
    markPhotoSeen(k);
    // Mirror the seen-state to the server so dedup follows the user
    // across reinstalls / a second device. Best-effort, fire-and-forget.
    const backendId = realPhotoIdsRef.current.get(theirPhoto.uri);
    if (backendId) {
      markPhotosSeen([backendId]).catch(() => {});
    }
  }, [theirPhoto.uri, myPhotoKey, markPhotoSeen]);

  // Music-vibe playback. When a new card lands we play the clip that
  // belongs to *their* photo (their pick — the user is hearing how the
  // stranger paired the moment, not their own taste). Falls back to a
  // local suggestion when the candidate is a sample / synthetic photo
  // that never carried a saved genre.
  const [muted, setMutedState] = useState<boolean>(audioIsMuted());
  useEffect(() => {
    return onMuteChange(setMutedState);
  }, []);
  useEffect(() => {
    if (!theirPhoto?.uri) return;
    // Don't play over the placeholder card (which is just the user's
    // own photo as a backdrop) or once the deck is exhausted.
    if (theirPhoto.id === "placeholder" || noMore) {
      void pauseAudio();
      return;
    }
    // Don't play while a fullscreen image modal is open — the modal is
    // a "look at this in detail" surface, audio competes with that.
    if (fullscreenUri !== null) {
      void pauseAudio();
      return;
    }
    // Resolve the genre defensively: a stored value that isn't in the
    // canonical library (legacy upload, server bug, hand-crafted JSON)
    // falls back to a fresh local suggestion instead of crashing the
    // playback path on a missing entry.
    const stored = theirPhoto.musicGenre;
    const genre: MusicGenre = (stored && getGenre(stored)?.id) ||
      suggestGenre(theirPhoto.theme, theirPhoto.tags);
    const clip = pickClipForSeed(genre, theirPhoto.uri);
    void playClip(clip.url);
  }, [theirPhoto.uri, theirPhoto.id, theirPhoto.musicGenre, theirPhoto.theme, noMore, fullscreenUri]);

  // Stop audio entirely when the screen unmounts (tab switch, navigation
  // away). pauseAudio handles app backgrounding internally via AppState.
  useEffect(() => {
    return () => {
      void stopAudio();
    };
  }, []);

  const toggleMute = useCallback(() => {
    const next = !audioIsMuted();
    setAudioMuted(next);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const loadNextCandidate = useCallback(() => {
    const currentUri = theirPhotoRef.current.uri;
    const currentKey = photoKey(currentUri);
    // The current photo is already in the ledger (mark-on-display),
    // so just hand the canonical exclusion set to the picker.
    const next = getTheirPhoto(
      activeThemeRef.current,
      myTagsRef.current,
      buildExcludeKeys(currentKey),
      currentKey,
      realPoolRef.current,
    );
    // After the swipe-out animation, the native-driven transform is parked
    // off-screen. Calling setValue from JS does NOT reliably propagate back
    // through useNativeDriver — the card stays invisible on subsequent taps.
    // Use a 0-duration animation so the native driver itself performs the
    // reset, then update photo state.
    sameOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(pan, {
        toValue: { x: 0, y: 0 },
        duration: 0,
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 1,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (next) {
        setTheirPhoto(next.photo);
        setMatchedTheme(next.matchedTheme);
        setSharedTags(next.sharedTags);
        setNoMore(false);
      } else {
        setNoMore(true);
      }
      isAnimatingOutRef.current = false;
    });
  }, [pan, cardScale, sameOpacity, buildExcludeKeys]);

  const handleSwipe = useCallback(
    (dir: "left" | "right") => {
      if (isAnimatingOutRef.current) return;
      // Don't record a swipe when there's nothing to swipe on.
      if (noMore) return;
      isAnimatingOutRef.current = true;

      Haptics.impactAsync(
        dir === "right"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );

      // Snapshot the current photo so a re-render mid-animation can't
      // change what we navigate to.
      const snapshotPhoto = theirPhotoRef.current;
      const snapshotShared = sharedTags;
      const snapshotMyUri = myPhotoUriRef.current;
      const snapshotTheme = activeThemeRef.current;
      const snapshotMyUploadedAt = myPhotoData.uploadedAt;

      Animated.parallel([
        Animated.timing(pan.x, {
          toValue: dir === "right" ? width * 1.5 : -width * 1.5,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.9,
          duration: 320,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Build a match record for BOTH verdicts so the user can revisit
        // and flip a previous swipe from My Journey. Stats / countries /
        // badges only count "same" — the context handles that branching.
        const match: Match = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          myPhoto: snapshotMyUri,
          theirPhoto: snapshotPhoto.uri,
          myCountry: myCountryName ?? "You",
          theirCountry: snapshotPhoto.country,
          theirCountryFlag: snapshotPhoto.countryFlag,
          theirCountryCode: snapshotPhoto.countryCode,
          similarityScore: 0,
          verdict: dir === "right" ? "same" : "different",
          timestamp: new Date().toISOString(),
          theme: snapshotTheme,
          theirPhotoMinutesAgo: snapshotPhoto.minutesAgo,
          myPhotoUploadedAt: snapshotMyUploadedAt,
          sharedTags: snapshotShared,
          theirVibe: expandToVibe(snapshotPhoto.tags ?? [], snapshotPhoto.uri),
        };
        const liveId = realPhotoIdsRef.current.get(snapshotPhoto.uri);
        // For "same" verdicts attach a stats payload so the reveal screen
        // can show "X others matched on this in the last hour". We seed it
        // immediately with deterministic sample numbers so the UI never
        // flickers with empty zeros, then upgrade to live numbers below
        // once the backend responds.
        const matchWithStats: Match =
          dir === "right"
            ? { ...match, matchStats: sampleMatchStats(snapshotPhoto.uri) }
            : match;
        addMatch(matchWithStats);
        if (liveId) {
          // Persist the verdict to the backend. Pass the user's currently-
          // active backend photo ID so the server can pair the two and
          // record an echo offer (or promote to mutual when complementary).
          const voterPhotoId = todaysPhoto?.backendId;
          votePhoto(
            liveId,
            dir === "right" ? "same" : "different",
            voterPhotoId,
          )
            .then((result) => {
              if (result.echo === "pending" || result.echo === "mutual") {
                // Refresh local echo lists so the inbox + bell catch up.
                refreshEchoes();
              }
            })
            .catch(() => {});
        }
        if (dir === "right") {
          // Show the lightweight in-card flash. It auto-dismisses (or the
          // user can tap "Open" to dive into the full /reveal screen).
          setFlashMatch(matchWithStats);
          // Async-upgrade to live stats if this was a real backend photo.
          // We only swap in the live numbers when there's at least one
          // real "same" vote — otherwise the seeded sample numbers feel
          // more like a populated app than a deflated empty one.
          if (liveId) {
            fetchMatchStats(liveId)
              .then((stats) => {
                if (stats.sameAllTime <= 0) return;
                setFlashMatch((cur) =>
                  cur && cur.id === matchWithStats.id
                    ? { ...cur, matchStats: stats }
                    : cur,
                );
              })
              .catch(() => {});
          }
        } else {
          // "Different" — silently move on, keep user's photo locked
          loadNextCandidate();
        }
      });
    },
    [sharedTags, myPhotoData.uploadedAt, pan.x, cardScale, loadNextCandidate, addMatch, myCountryName]
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < 80,
      onPanResponderMove: (_, g) => {
        pan.setValue({ x: g.dx, y: g.dy * 0.08 });
        const progress = Math.abs(g.dx) / SWIPE_THRESHOLD;
        if (g.dx > 0) {
          sameOpacity.setValue(Math.min(progress, 1));
        } else {
          sameOpacity.setValue(0);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          handleSwipe("right");
        } else if (g.dx < -SWIPE_THRESHOLD) {
          handleSwipe("left");
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            tension: 120,
            friction: 8,
          }).start();
          sameOpacity.setValue(0);
        }
      },
    })
  ).current;

  const rotation = pan.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ["-7deg", "0deg", "7deg"],
    extrapolate: "clamp",
  });

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  // Treat the user as "no photo for today" if their last upload is from a
  // previous UTC day — this makes Start Matching prompt for a fresh photo
  // each new daily-challenge cycle instead of recycling yesterday's.
  const hasUploadedPhoto = todaysPhoto !== undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View>
          <EchoLogo
            size="sm"
            color={colors.foreground}
            taglineColor={colors.mutedForeground}
          />
          <Text style={[styles.subtitle, { color: colors.mutedForeground, marginTop: 4 }]}>
            {streakCount > 0 ? `${streakCount} matches` : "Find your similar"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={toggleMute}
            style={[
              styles.cameraBtn,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.85}
            accessibilityLabel={muted ? "Unmute vibe music" : "Mute vibe music"}
          >
            <Icon
              name={muted ? "volume-x" : "volume-2"}
              size={18}
              color={colors.foreground}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/camera")}
            style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Icon name="camera" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.challengeBar, { borderColor: colors.border }]}>
        <Text style={styles.challengeEmoji}>
          {hasUploadedPhoto ? themeEmoji : todaysChallenge.emoji}
        </Text>
        <Text style={[styles.challengeText, { color: colors.mutedForeground }]}>
          {hasUploadedPhoto ? "Matching: " : "Today's prompt: "}
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
            {hasUploadedPhoto ? themeTitle : todaysChallenge.title}
          </Text>
        </Text>
        {hasUploadedPhoto && (
          <View style={[styles.uploadedBadge, { backgroundColor: colors.teal + "22" }]}>
            <Icon name="check" size={10} color={colors.teal} />
            <Text style={[styles.uploadedText, { color: colors.teal }]}>
              Your photo
            </Text>
          </View>
        )}
      </View>

      {hasUploadedPhoto && matchedTheme !== activeTheme && (() => {
        const nearby = DAILY_CHALLENGES.find((c) => c.id === matchedTheme);
        if (!nearby) return null;
        return (
          <View style={[styles.nearbyBar, { backgroundColor: colors.gold + "1a", borderColor: colors.gold + "55" }]}>
            <Text style={styles.nearbyEmoji}>{nearby.emoji}</Text>
            <Text style={[styles.nearbyText, { color: colors.foreground }]}>
              Trying theme:{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>{nearby.title}</Text>
            </Text>
          </View>
        );
      })()}

      <View style={styles.cardArea}>
        {!hasUploadedPhoto && (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "22" }]}>
              <Icon name="camera" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Add your photo to start matching
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Share a moment from today and we'll find someone, somewhere in the world,
              who shared something similar.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/camera")}
              style={[styles.emptyCta, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Icon name="camera" size={18} color="#fff" />
              <Text style={styles.emptyCtaText}>Add your photo</Text>
            </TouchableOpacity>
          </View>
        )}
        {hasUploadedPhoto && noMore && (
          <View style={[styles.cardWrapper, styles.emptyStateWrapper]}>
            <View
              style={[
                styles.card,
                styles.emptyStateCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.emptyStateEmoji]}>🌍</Text>
              <Text style={[styles.emptyStateTitle, { color: colors.foreground }]}>
                You're all caught up
              </Text>
              <Text style={[styles.emptyStateBody, { color: colors.mutedForeground }]}>
                You've seen every "{themeTitle.toLowerCase()}" moment we have right now. Post a new photo to start a fresh session, or check back soon for new arrivals from across the world.
              </Text>
              <TouchableOpacity
                style={[styles.emptyStateBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/camera")}
                activeOpacity={0.85}
              >
                <Icon name="camera" size={16} color={colors.primaryForeground} />
                <Text
                  style={[
                    styles.emptyStateBtnText,
                    { color: colors.primaryForeground, marginLeft: 8 },
                  ]}
                >
                  Post a new photo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.emptyStateBtn,
                  styles.emptyStateBtnGhost,
                  { borderColor: colors.border, marginTop: 10 },
                ]}
                onPress={() => {
                  // "Show again" — flip the per-mount bypass so the next
                  // pick ignores the persistent ledger. The ledger itself
                  // is preserved (we don't want to forget the user's
                  // history), and mark-on-display is suppressed for the
                  // bypassed picks via sessionDisplayedRef so we don't
                  // immediately re-flag everything as seen.
                  bypassSeenRef.current = true;
                  // Pre-seed sessionDisplayedRef with the current ledger
                  // so the post-mount re-pick effect won't clobber the
                  // bypass on the very next render.
                  for (const k of seenSetRef.current) {
                    sessionDisplayedRef.current.add(k);
                  }
                  const next = getTheirPhoto(
                    activeTheme,
                    myTags,
                    buildExcludeKeys(),
                    undefined,
                    realPoolRef.current,
                  );
                  if (next) {
                    setTheirPhoto(next.photo);
                    setMatchedTheme(next.matchedTheme);
                    setSharedTags(next.sharedTags);
                    setNoMore(false);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.emptyStateBtnText, { color: colors.mutedForeground }]}
                >
                  Show photos I've seen
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {hasUploadedPhoto && !noMore && (
        <Animated.View
          style={[
            styles.cardWrapper,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { rotate: rotation },
                { scale: cardScale },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Animated.View
            style={[
              styles.sameLabel,
              { opacity: sameOpacity, borderColor: colors.teal },
            ]}
          >
            <Text style={[styles.labelText, { color: colors.teal }]}>
              SAME SAME
            </Text>
          </Animated.View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Pressable
              style={styles.photoSection}
              onPress={() => setFullscreenUri(myPhotoUri)}
            >
              <Image
                source={{ uri: myPhotoUri }}
                style={styles.fillPhoto}
                resizeMode="cover"
              />
              <View style={[styles.photoTag, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                <Text style={[styles.photoTagText, { color: "#fff" }]}>
                  {hasUploadedPhoto ? "Your photo" : "Your moment"}
                </Text>
                <Text style={[styles.photoTagTime, { color: "rgba(255,255,255,0.75)" }]}>
                  {timeAgo(new Date(myPhotoData.uploadedAt))}
                </Text>
              </View>
              <View style={[styles.expandHint, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                <Icon name="maximize" size={12} color="#fff" />
              </View>
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.card }]}>
              <View style={[styles.vsChip, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.vsText, { color: colors.mutedForeground }]}>
                  vs
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.photoSection}
              onPress={() => setFullscreenUri(theirPhoto.uri)}
            >
              <Image
                source={{ uri: theirPhoto.uri }}
                style={styles.fillPhoto}
                resizeMode="cover"
              />
              <View
                style={[
                  styles.photoTag,
                  styles.photoTagLifted,
                  { backgroundColor: "rgba(0,0,0,0.55)" },
                ]}
              >
                <Text style={[styles.photoTagText, { color: "#fff" }]}>
                  {/* Hint at distance without spoiling the country reveal.
                      Uses the user's chosen home country (from onboarding /
                      profile) to surface Same Country / Same Continent /
                      Same Planet labels. */}
                  {getGeoTier(myCountryCode, theirPhoto.countryCode).emoji}{" "}
                  {getGeoTier(myCountryCode, theirPhoto.countryCode).label.toLowerCase()}
                </Text>
                <Text style={[styles.photoTagTime, { color: "rgba(255,255,255,0.75)" }]}>
                  {timeAgo(simulatedPostedAt(theirPhoto.minutesAgo))}
                </Text>
              </View>
              <View style={[styles.expandHint, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                <Icon name="maximize" size={12} color="#fff" />
              </View>
              {sharedTags.length > 0 && (
                <View style={[styles.sharedTagsChip, { backgroundColor: colors.teal + "f2" }]}>
                  <Text style={styles.sharedTagsLabel}>Both have</Text>
                  <Text style={styles.sharedTagsValue}>
                    {sharedTags
                      .slice(0, 3)
                      .map((id) => {
                        const t = TAG_LIBRARY.find((x) => x.id === id);
                        return t ? `${t.emoji} ${t.label}` : id;
                      })
                      .join("  ·  ")}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Floating action buttons overlaid on the bottom of the card */}
            <View
              style={[
                styles.actionOverlay,
                { paddingBottom: 14 },
              ]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={[styles.actionBtn, styles.skipBtn]}
                onPress={() => handleSwipe("left")}
                activeOpacity={0.8}
                accessibilityLabel="Skip"
              >
                <Icon name="x" size={26} color="#fff" />
              </TouchableOpacity>

              <View style={{ flex: 1 }} pointerEvents="none" />

              <TouchableOpacity
                style={[styles.actionBtn, styles.matchBtn, { backgroundColor: colors.teal }]}
                onPress={() => handleSwipe("right")}
                activeOpacity={0.85}
                accessibilityLabel="Same Same"
              >
                <MatchHearts size={30} color="#001018" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
        )}
      </View>

      {/* Lightweight in-card celebration. Auto-advances to the next
          candidate on dismiss; "Open" navigates to the full /reveal. */}
      {flashMatch && (() => {
        const themeMeta = DAILY_CHALLENGES.find(
          (c) => c.id === flashMatch.theme || c.title.toLowerCase() === flashMatch.theme,
        );
        return (
          <MatchFlash
            theirCountry={flashMatch.theirCountry}
            theirCountryFlag={flashMatch.theirCountryFlag}
            myCountryFlag={myCountryFlag}
            themeTitle={themeMeta?.title ?? flashMatch.theme ?? "the same thing"}
            themeEmoji={themeMeta?.emoji ?? "✨"}
            sharedTags={flashMatch.sharedTags ?? []}
            onDone={() => {
              setFlashMatch(null);
              loadNextCandidate();
            }}
            onOpenFull={() => {
              const data = flashMatch;
              setFlashMatch(null);
              // Pre-load the next card so it's ready when they come back.
              loadNextCandidate();
              router.push({
                pathname: "/reveal",
                params: { matchData: JSON.stringify(data) },
              });
            }}
          />
        );
      })()}

      {/* Fullscreen image viewer */}
      <Modal
        visible={fullscreenUri !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenUri(null)}
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Pressable
          style={styles.fullscreenBackdrop}
          onPress={() => setFullscreenUri(null)}
        >
          {fullscreenUri && (
            <Image
              source={{ uri: fullscreenUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            onPress={() => setFullscreenUri(null)}
            style={[styles.fullscreenClose, { top: insets.top + 12 }]}
            activeOpacity={0.85}
            accessibilityLabel="Close"
          >
            <Icon name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      <View style={{ paddingBottom: bottomPadding }} />

      {/* DEV-only dedup ledger debug pill. Anonymity-safe — shows only
          opaque photo keys, never country, name, or any identity. Hidden
          in release builds via the __DEV__ gate. */}
      {__DEV__ && (
        <>
          <TouchableOpacity
            onPress={() => setDebugOpen(true)}
            style={[
              styles.debugPill,
              { bottom: bottomPadding + 12, backgroundColor: colors.card, borderColor: colors.border },
            ]}
            activeOpacity={0.85}
            accessibilityLabel="Open dedup debug panel"
          >
            <Text style={[styles.debugPillText, { color: colors.mutedForeground }]}>
              seen {seenPhotoKeys.length}
            </Text>
          </TouchableOpacity>
          <Modal
            visible={debugOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setDebugOpen(false)}
          >
            <Pressable
              style={styles.debugBackdrop}
              onPress={() => setDebugOpen(false)}
            >
              <Pressable
                style={[styles.debugSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={[styles.debugTitle, { color: colors.foreground }]}>
                  Seen ledger ({seenPhotoKeys.length})
                </Text>
                <Text style={[styles.debugSub, { color: colors.mutedForeground }]}>
                  Most recent {Math.min(10, seenPhotoKeys.length)} keys
                </Text>
                <View style={{ marginTop: 12 }}>
                  {seenPhotoKeys.slice(-10).reverse().map((k) => (
                    <Text
                      key={k}
                      numberOfLines={1}
                      style={[styles.debugKey, { color: colors.foreground }]}
                    >
                      • {k}
                    </Text>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.debugResetBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    resetSeenPhotos();
                    setDebugOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.debugResetText, { color: colors.primaryForeground }]}>
                    Reset ledger
                  </Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  );
}

const CARD_WIDTH = width - 24;

const styles = StyleSheet.create({
  container: { flex: 1 },
  // ── DEV-only dedup debug pill ────────────────────────────────────
  debugPill: {
    position: "absolute",
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    opacity: 0.85,
  },
  debugPillText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  debugBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  debugSheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  debugTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  debugSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  debugKey: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginVertical: 2,
  },
  debugResetBtn: {
    marginTop: 16,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
  },
  debugResetText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  appTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  cameraBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  challengeBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 0,
  },
  challengeEmoji: { fontSize: 15 },
  challengeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  uploadedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  uploadedText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  nearbyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  nearbyEmoji: { fontSize: 14 },
  nearbyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  cardArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === "web" ? 90 : 70,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    flex: 1,
  },
  emptyCard: {
    width: CARD_WIDTH,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 14,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    marginTop: 8,
  },
  emptyCtaText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  emptyStateWrapper: {
    justifyContent: "center",
  },
  emptyStateCard: {
    flex: 0,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    borderWidth: 1,
  },
  emptyStateEmoji: {
    fontSize: 56,
    marginBottom: 4,
  },
  emptyStateTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    textAlign: "center",
  },
  emptyStateBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 6,
  },
  emptyStateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
    marginTop: 4,
  },
  emptyStateBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  emptyStateBtnText: {
    color: "#001018",
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  card: {
    width: CARD_WIDTH,
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
  },
  photoSection: {
    position: "relative",
    flex: 1,
  },
  fillPhoto: {
    width: "100%",
    height: "100%",
  },
  photoTag: {
    position: "absolute",
    bottom: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  photoTagLifted: {
    bottom: 84, // clear of the bottom action buttons
  },
  expandHint: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  actionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  matchBtn: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  swipeHintPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  swipeHintText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.3,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.97)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  fullscreenClose: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  photoTagText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  photoTagTime: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  sharedTagsChip: {
    position: "absolute",
    top: 8,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "70%",
  },
  sharedTagsLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#001018",
    opacity: 0.7,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sharedTagsValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#001018",
    marginTop: 1,
  },
  divider: {
    position: "absolute",
    top: "50%",
    marginTop: -14,
    left: 0,
    right: 0,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  vsChip: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  vsText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  sameLabel: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 10,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    transform: [{ rotate: "12deg" }],
  },
  labelText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  swipeHint: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  hintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  hintText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  swipeInstruction: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
