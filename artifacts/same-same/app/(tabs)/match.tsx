import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { markTabVisited } from "@/utils/tabVisits";
import { tabBarTotalHeight } from "@/utils/tabBarSafeArea";
import { Icon } from "@/components/Icon";
import { MicBadge } from "@/components/MicBadge";
import { MatchFlash } from "@/components/MatchFlash";
import { EchoLogo } from "@/components/EchoLogo";
import { OceanShimmer } from "@/components/OceanShimmer";
import { PressableScale } from "@/components/PressableScale";
import { GradientCard } from "@/components/GradientCard";
import { expandToVibe } from "@/utils/interests";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { isAiPhoto, useApp } from "@/context/AppContext";
import {
  SAMPLE_PHOTOS,
  DAILY_CHALLENGES,
  getTodaysChallenge,
  getThemeChain,
  resolveChallengeThemeId,
  themeMatchPoints,
  shouldSinkOffTopic,
  TAG_LIBRARY,
  generateSyntheticCandidates,
  ENABLE_SYNTHETIC_MATCHES,
  isBannedStockPhotoUri,
  isSamplePhoto,
  type SamplePhoto,
} from "@/data/samplePhotos";
import { AiGeneratedBadge } from "@/components/AiGeneratedBadge";
import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { MatchPhotoDevOverlay } from "@/components/MatchPhotoDevOverlay";
import { StockPhotoWatermark } from "@/components/StockPhotoWatermark";
import {
  scoreSubjectMatch,
  sharedSubjectLabels,
  expandSubjectsForQuery,
} from "@/data/subjectMatch";
import { ENABLE_STOCK_PHOTO_POOL } from "@/lib/stockPhotos";
import {
  fetchCandidates,
  votePhoto,
  fetchMatchStats,
  markPhotosSeen,
  matchByObject,
  authedImageHeaders,
  explorePhotoUriNeedsAuth,
  warmAuthedImageHeaders,
  type CandidatePhoto,
} from "@/utils/api";
import { requestAtlasRefresh } from "@/utils/atlasHub";
import { resolveMusicUrl } from "@/data/musicLibrary";
import {
  THEME_RELEVANCE_TARGET,
  SUBJECT_RELEVANCE_TARGET,
  isThemeRelevant,
  isSubjectRelevant,
  rollRelevance,
  shouldWidenToSuggestedTheme,
} from "@/data/matchTuning";
import { mergeCandidatePools } from "@/utils/candidatePool";
import {
  isMuted as audioIsMuted,
  markUserInteracted,
  onMuteChange,
  pause as pauseAudio,
  pauseIfLease,
  pausePreview,
  playClip,
  prewarmClip,
  setMuted as setAudioMuted,
  stopIfLease,
  warmAudioSession,
} from "@/utils/audio";
import { sampleMatchStats } from "@/utils/sampleStats";
import { photoCountryDisplay } from "@/utils/photoCountry";
import { resolveMyPhotoDisplayUri, pickVoterPhotoBackendId, serverPhotoImageUrl } from "@/utils/photoDisplayUri";
import { stopWavefireAmbience } from "@/utils/wavefireAmbience";
import { stopFirecircleAmbience } from "@/utils/firecircleAudio";
import { timeAgo, simulatedPostedAt } from "@/utils/timeAgo";
import type { Match } from "@/context/AppContext";
import { photoKey } from "@/utils/photoKey";
import { stashMatchPhotoUris } from "@/utils/matchPhotoSnapshot";
import { rememberVoterPhotoForTarget } from "@/utils/voterPhotoByTarget";
import { RIPPLE_CARD_WIDTH } from "@/constants/ripplePhotoFrame";
import { normalizeUnsplashUri } from "@/utils/unsplashUri";
import { withDisplayPhotoWidth } from "@/utils/photoDisplayUri";

const { width } = Dimensions.get("window");
/** How far (px) a drag must travel before it counts as a vote. */
const SWIPE_DISTANCE_THRESHOLD = width * 0.136;
/** Fast horizontal flicks commit with a shorter drag (px/s from RNGH). */
const SWIPE_VELOCITY_THRESHOLD = 336;
const SWIPE_MIN_FLICK_DX = 22;
const SWIPE_OUT_MS = 300;
const SNAP_BACK_SPRING = { damping: 20, stiffness: 220, mass: 0.75 };

function shouldCommitHorizontalSwipe(dx: number, vx: number): boolean {
  "worklet";
  if (Math.abs(dx) >= SWIPE_DISTANCE_THRESHOLD) return true;
  return (
    Math.abs(vx) >= SWIPE_VELOCITY_THRESHOLD &&
    Math.abs(dx) >= SWIPE_MIN_FLICK_DX
  );
}

/** Swipe-out runs on the UI thread so release → fly-off feels instant. */
function playSwipeOutAnimation(
  dir: "left" | "right",
  translateX: SharedValue<number>,
  translateY: SharedValue<number>,
  cardScale: SharedValue<number>,
  onFinished?: () => void,
) {
  "worklet";
  const targetX = dir === "right" ? width * 1.5 : -width * 1.5;
  const easing = Easing.out(Easing.cubic);
  translateX.value = withTiming(
    targetX,
    { duration: SWIPE_OUT_MS, easing },
    (finished) => {
      if (finished && onFinished) onFinished();
    },
  );
  translateY.value = withTiming(0, { duration: SWIPE_OUT_MS, easing });
  cardScale.value = withTiming(0.92, { duration: SWIPE_OUT_MS, easing });
}

function resetCardMotion(
  translateX: SharedValue<number>,
  translateY: SharedValue<number>,
  scale: SharedValue<number>,
  sameLabelOpacity: SharedValue<number>,
) {
  "worklet";
  translateX.value = 0;
  translateY.value = 0;
  scale.value = 1;
  sameLabelOpacity.value = 0;
}

// Candidate scoring: shared tags weigh most, then same theme, then adjacent
// theme, then recency. Returns scored unseen candidates sorted high → low.
type Scored = {
  photo: typeof SAMPLE_PHOTOS[number];
  score: number;
  sharedTags: string[];
  /**
   * Visual-form / shape tags the candidate shares with the requester's
   * photo. Filled from `photo.shapes ∩ myShapes`. Empty when either
   * side has no shapes recorded — those candidates simply earn 0
   * shape points instead of being excluded.
   */
  sharedShapes: string[];
  /**
   * Free-form concrete subjects the candidate shares with the
   * requester's photo. Filled from `photo.subjects ∩ mySubjects` —
   * empty when either side has no subjects recorded (legacy rows or
   * sample data). Drives the heaviest single-axis bonus, mirrored on
   * the server in the /candidates SQL.
   */
  sharedSubjects: string[];
  inChain: boolean;
};

function scoreCandidates(
  preferredTheme: string,
  myTags: string[],
  excludeKeys: Set<string>,
  extraPool: SamplePhoto[] = [],
  // `relaxFloor` is kept as an arg for source-compat with existing
  // callers but is no longer consulted. The previous strict floor
  // (same-theme OR ≥2 shared tags) hid almost every candidate when the
  // pool was thin (95 sample photos spread across ~100 themes). The
  // rebalanced score already promotes related photos to the top of the
  // ranking, so we always return the full ranked list and let the
  // caller's top-tier window do the curation.
  _relaxFloor: boolean = false,
  myShapes: string[] = [],
  // Free-form concrete subjects (apple, sculpture, latte art…) from
  // the requester's photo. Defaults to empty so legacy callers get the
  // old 0-pt subject term and behaviour stays unchanged for them.
  // Mirrors the server's `subjects=` query param exactly so live and
  // dev/synthetic candidates rank in the same order.
  mySubjects: string[] = [],
): Scored[] {
  const chain = getThemeChain(preferredTheme);
  const chainIndex = (candidateTheme: string) => {
    const id = resolveChallengeThemeId(candidateTheme) || candidateTheme;
    const i = chain.indexOf(id);
    return i;
  };
  const myTagSet = new Set(myTags);
  const myShapeSet = new Set(myShapes);

  // Production launch: curated stock (Unsplash) + live API candidates.
  // Dev/Expo Go: stock + synthetic generator + API. Synthetic stays dev-only.
  const synthetic = generateSyntheticCandidates(preferredTheme, myTags, 24, excludeKeys);
  const stock = ENABLE_STOCK_PHOTO_POOL ? SAMPLE_PHOTOS : [];
  const pool: SamplePhoto[] = ENABLE_SYNTHETIC_MATCHES
    ? [...stock, ...synthetic, ...extraPool]
    : [...stock, ...extraPool];

  // Excluded keys + per-call key dedupe. We compare on the stable
  // photoKey (not the raw URI) so two URIs pointing at the same image
  // — different ?w= params, trailing slashes, etc. — never both pass.
  const seenInPool = new Set<string>();
  const candidates: Scored[] = pool
    .filter((p) => {
      const k = photoKey(p.uri);
      if (!k) return false;
      if (isBannedStockPhotoUri(p.uri)) return false;
      if (excludeKeys.has(k)) return false;
      if (seenInPool.has(k)) return false;
      seenInPool.add(k);
      return true;
    })
    .map((p) => {
      const sharedTags = p.tags.filter((t) => myTagSet.has(t));
      const sharedShapes = (p.shapes ?? []).filter((s) => myShapeSet.has(s));
      const subjectMatch = scoreSubjectMatch(mySubjects, p.subjects ?? []);
      const sharedSubjects = sharedSubjectLabels(
        mySubjects,
        p.subjects ?? [],
      );
      const idx = chainIndex(p.theme);
      const inChain = idx >= 0;
      const themeScore = themeMatchPoints(preferredTheme, p.theme);
      const sameTheme = themeScore >= 10;
      // SCORING — mirrors the server's /candidates SQL so live and stock
      // candidates rank consistently. Subject overlap is heaviest; theme
      // uses interpretive matching (titles, ids, adjacency, fuzzy text).
      const subjectScore = subjectMatch.points;
      const vibeScore = Math.min(sharedTags.length, 5) * 2;
      const shapeScore = Math.min(sharedShapes.length, 5) * 2;
      const chainBonus =
        inChain && !sameTheme && themeScore < 10
          ? Math.max(0, 3 - Math.max(idx, 0))
          : 0;
      const offTopic = shouldSinkOffTopic(
        preferredTheme,
        p.theme,
        sharedTags.length,
        subjectMatch.points > 0 ? 1 : 0,
      );
      const score =
        subjectScore +
        themeScore +
        vibeScore +
        shapeScore +
        chainBonus +
        Math.max(0, 0.6 - p.minutesAgo / 4320) -
        (offTopic ? 14 : 0);
      return {
        photo: p,
        score,
        sharedTags,
        sharedShapes,
        sharedSubjects,
        inChain,
      };
    })
    // No hard floor — the rebalanced score (theme=10, vibe up to 10,
    // shapes up to 10) already pushes related photos to the top. With
    // only ~95 sample photos spread across ~100 themes the previous
    // strict gate (same-theme OR ≥2 shared tags) silently dropped most
    // of the pool, so the user saw "all caught up" while real
    // candidates were sitting unseen. Trusting the score lets every
    // sample/stock photo surface and the top-tier window in
    // getTheirPhoto curates the actual pick.
    .sort((a, b) => b.score - a.score);
  return candidates;
}

function countThemeRelevantCandidates(
  preferredTheme: string,
  myTags: string[],
  excludeKeys: Set<string>,
  pool: SamplePhoto[],
  mySubjects: string[],
): number {
  const ranked = scoreCandidates(
    preferredTheme,
    myTags,
    excludeKeys,
    pool,
    false,
    [],
    mySubjects,
  );
  return ranked.filter((c) =>
    isThemeRelevant({
      candidateTheme: c.photo.theme,
      preferredTheme,
      sharedTags: c.sharedTags,
    }),
  ).length;
}

function resolveLiveCandidateUri(c: CandidatePhoto): string {
  const preview = c.previewUri?.trim() ?? "";
  if (preview.startsWith("data:")) return preview;
  const raw = c.uri?.trim() ?? "";
  if (raw.startsWith("https://")) {
    return withDisplayPhotoWidth(normalizeUnsplashUri(raw) ?? raw);
  }
  return serverPhotoImageUrl(c.id);
}

function mapFetchedCandidates(
  cands: CandidatePhoto[],
  fallbackTheme: string,
): { mapped: SamplePhoto[]; ids: Map<string, string> } {
  const ids = new Map<string, string>();
  const mapped: SamplePhoto[] = cands.map((c) => {
    const capture =
      typeof c.captureCountryCode === "string" &&
      c.captureCountryCode.length === 2
        ? c.captureCountryCode.toUpperCase()
        : undefined;
    const disp = photoCountryDisplay(capture);
    const minutesAgo = Math.max(
      1,
      Math.round((Date.now() - new Date(c.createdAt).getTime()) / 60000),
    );
    const streamUri = resolveLiveCandidateUri(c);
    ids.set(streamUri, c.id);
    return {
      id: `live-${c.id}`,
      uri: streamUri,
      country: disp.name,
      countryCode: disp.code ?? "",
      countryFlag: disp.flag,
      captureCountryCode: capture,
      theme: c.theme || fallbackTheme,
      minutesAgo,
      // Absolute timestamps for the temporal tier — snapshotted into the match
      // at swipe time so the calendar tier is computed from fixed instants and
      // never drifts. capturedAt is the real capture time when known.
      capturedAt: c.capturedAt ?? undefined,
      createdAt: typeof c.createdAt === "string" ? c.createdAt : undefined,
      tags: c.tags,
      shapes: c.shapeTags,
      subjects: c.subjects,
      musicGenre: c.musicGenre ?? undefined,
      customAudioUrl: c.customAudioUrl ?? undefined,
    };
  });
  return { mapped, ids };
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
  myShapes: string[] = [],
  // Free-form concrete subjects from the requester's photo. Forwarded
  // straight into scoreCandidates so the local re-rank can earn the
  // heaviest single-axis bonus on top of the existing theme/vibe/shape
  // signals. Empty for legacy call sites — those just see the old 0-pt
  // subject term and behave unchanged.
  mySubjects: string[] = [],
): { photo: typeof SAMPLE_PHOTOS[number]; matchedTheme: string; sharedTags: string[] } | null {
  // Primary ranking pass with shapes + subjects threaded through so
  // both the primary deck (subjects from the user's own photo) and
  // subject-matter mode (caller passes AI-detected objects as
  // `mySubjects` and visual shapes as `myShapes`) score correctly.
  let ranked = scoreCandidates(
    preferredTheme,
    myTags,
    excludeKeys,
    extraPool,
    false,
    myShapes,
    mySubjects,
  );
  if (ranked.length === 0) {
    // Safety net for the rare case where the dedupe / exclusion combo
    // empties the pool entirely. The strict floor is no longer applied
    // by scoreCandidates, but we keep the relax-mode call site so any
    // future tightening of the score gating still has a graceful
    // fallback before we hand back null.
    ranked = scoreCandidates(
      preferredTheme,
      myTags,
      excludeKeys,
      extraPool,
      true,
      myShapes,
      mySubjects,
    );
  }
  // Relevance gate — see data/matchTuning.ts for the full rationale.
  // We roll two INDEPENDENT Bernoulli trials at the configured targets
  // (default 0.6 / 0.6). The same two booleans drive both the ranked
  // pool below AND the synthetic fallback further down, so dev/Expo Go
  // and prod feel identical under the same tuning.
  const themeFired = rollRelevance(THEME_RELEVANCE_TARGET);
  const subjectFired = rollRelevance(SUBJECT_RELEVANCE_TARGET);
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
    // Apply the same relevance gate to synth photos so dev/Expo Go
    // honors the configured targets exactly the way prod does. Synth
    // candidates aren't pre-scored, so we compute the predicate fields
    // (sharedTags / sharedSubjects / sharedShapes) inline against the
    // requester's tags/subjects/shapes — same definitions
    // scoreCandidates uses. Graceful fallback: if a gate empties the
    // pool, drop it; if both empty it, fall back to the unrestricted
    // synth set so we never return null when synth photos exist.
    const myTagSetSynth = new Set(myTags);
    const myShapeSetSynth = new Set(myShapes);
    let synthPool = fresh;
    if (themeFired) {
      const themeOnly = synthPool.filter((p) =>
        isThemeRelevant({
          candidateTheme: p.theme,
          preferredTheme,
          sharedTags: p.tags.filter((t) => myTagSetSynth.has(t)),
          themeChain: getThemeChain(preferredTheme),
        }),
      );
      if (themeOnly.length > 0) synthPool = themeOnly;
    }
    if (subjectFired) {
      const subjectOnly = synthPool.filter((p) =>
        isSubjectRelevant({
          mySubjects,
          candidateSubjects: p.subjects ?? [],
          sharedShapes: (p.shapes ?? []).filter((s) => myShapeSetSynth.has(s)),
        }),
      );
      if (subjectOnly.length > 0) synthPool = subjectOnly;
    }
    const pick = synthPool[Math.floor(Math.random() * synthPool.length)];
    return {
      photo: pick,
      matchedTheme: pick.theme,
      sharedTags: pick.tags.filter((t) => myTagSetSynth.has(t)),
    };
  }
  // Each "fired" gate restricts the ranked pool to the matching subset
  // before the top-tier window picks. If either restriction empties the
  // pool we drop that gate gracefully (subject, then theme, then
  // unrestricted) so we always return a pick when one exists —
  // preserves the no-regression promise on "all caught up".
  let pool = ranked;
  if (themeFired) {
    const themeOnly = pool.filter((c) =>
      isThemeRelevant({
        candidateTheme: c.photo.theme,
        preferredTheme,
        sharedTags: c.sharedTags,
        themeChain: getThemeChain(preferredTheme),
      }),
    );
    if (themeOnly.length > 0) pool = themeOnly;
  }
  if (subjectFired) {
    const subjectOnly = pool.filter((c) =>
      isSubjectRelevant({
        sharedSubjects: c.sharedSubjects,
        sharedShapes: c.sharedShapes,
      }),
    );
    if (subjectOnly.length > 0) pool = subjectOnly;
  }
  // Tight top-tier window (0.6 pts) so we only randomise between
  // genuinely-comparable matches, never reach for the next-best-thing.
  // Window is computed against the FILTERED pool so a single relevant
  // candidate can stand alone instead of being demoted by an irrelevant
  // higher-scoring outlier (which would have happened on the unrestricted
  // ranking). Cap of 6 keeps the random pick meaningful.
  const topScore = pool[0].score;
  let topTier = pool.filter((c) => c.score >= topScore - 0.6).slice(0, 6);
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

  // True only while the Ripple tab is the focused screen. The vibe-music
  // effect reads this so a background state change (e.g. a cloud sync landing
  // while the user is on another tab) can never restart the deck's music while
  // we're away — the "music keeps playing after leaving Ripple" bug.
  const isScreenFocusedRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      markTabVisited("match");
      warmAuthedImageHeaders();
      // Kill BOTH Atlas ambience players before the card vibe starts. The
      // vibe clip lives in the utils/audio singleton, but Wavefire ambience
      // and Firecircle ocean/fire loops are independent expo-av Sounds — if
      // either is still looping when the user lands on Ripple you hear two
      // tracks at once. Stopping both here makes the Ripple deck the only
      // audio source on this screen.
      void stopWavefireAmbience();
      void stopFirecircleAmbience();
      // On blur: pause the swipe card's background music (lease-aware,
      // no-ops if another screen has since taken over the singleton)
      // and any voice-clip preview the user started via a mic badge.
      return () => {
        isScreenFocusedRef.current = false;
        void pauseIfLease(playLeaseRef.current);
        void pausePreview();
      };
    }, []),
  );
  const {
    streakCount,
    myPhotos,
    addMatch,
    patchMatchVoterPhoto,
    refreshEchoes,
    myCountryCode,
    myCountryName,
    myCountryFlag,
    seenPhotoKeys,
    seenPhotoIds,
    markPhotoSeen,
    resetSeenPhotos,
    primeSeenFromCandidates,
    proUnlocked,
    hasHydrated,
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

  /** Latest today's-photo backend id for async vote callbacks (echo retry). */
  const todayBackendIdRef = useRef<string | undefined>(undefined);
  const echoRetryPhotoIdsRef = useRef<Set<string>>(new Set());
  todayBackendIdRef.current =
    typeof todaysPhoto?.backendId === "string" && todaysPhoto.backendId.length > 0
      ? todaysPhoto.backendId
      : undefined;

  const myPhotoDisplay = React.useMemo(
    () =>
      photoCountryDisplay(todaysPhoto?.captureCountryCode, {
        sampleUri: todaysPhoto?.uri,
      }),
    [todaysPhoto?.captureCountryCode, todaysPhoto?.uri],
  );

  // User's photo is LOCKED for the session — only changes when they upload a new one
  const myPhotoData = React.useMemo<{
    uri: string;
    uploadedAt: string;
    /** Real capture time (ISO) of my photo when known — preferred tier basis. */
    capturedAt?: string;
    theme: string;
    tags: string[];
    /**
     * Free-form concrete subjects (apple, sculpture, latte art…)
     * detected by Gemini at upload time. Threaded through into both
     * the /candidates fetch (`subjects=` query param) and the local
     * scoreCandidates re-rank so the heaviest single-axis bonus
     * actually fires. Empty for sample data and for legacy uploads
     * that predate the column.
     */
    subjects: string[];
  }>(() => {
    if (todaysPhoto) {
      return {
        uri: resolveMyPhotoDisplayUri(todaysPhoto, { preferLocalCapture: true }),
        uploadedAt: todaysPhoto.uploadedAt,
        capturedAt: todaysPhoto.capturedAt,
        theme: todaysPhoto.theme,
        tags: todaysPhoto.tags ?? [],
        subjects: todaysPhoto.subjects ?? [],
      };
    }
    const sample = SAMPLE_PHOTOS[0];
    return {
      uri: sample.uri,
      uploadedAt: simulatedPostedAt(5).toISOString(),
      capturedAt: sample.capturedAt,
      theme: sample.theme,
      tags: sample.tags,
      subjects: sample.subjects ?? [],
    };
  }, [todaysPhoto]);

  const myPhotoUri = myPhotoData.uri;
  // Durable fallback for the viewer's own photo: if the `file://` capture has
  // been purged while backgrounded, RemotePhotoImage falls back to the authed
  // server image (their real upload) instead of a stock Unsplash placeholder.
  const myPhotoFallbackUri = React.useMemo(() => {
    const bid = todaysPhoto?.backendId?.trim();
    return bid ? serverPhotoImageUrl(bid) : undefined;
  }, [todaysPhoto?.backendId]);
  /** Stable across local→server display URI swaps during upload sync. */
  const myPhotoSessionKey =
    todaysPhoto?.backendId?.trim() ||
    todaysPhoto?.uploadedAt ||
    photoKey(myPhotoUri) ||
    myPhotoUri;
  const myPhotoRecyclingKey = `match-my:${myPhotoSessionKey}`;
  const rawTheme = myPhotoData.theme;
  // Canonical id for scoring + /candidates (uploads may store "your hands").
  const activeTheme =
    resolveChallengeThemeId(rawTheme) ||
    rawTheme ||
    getTodaysChallenge().id;
  const myTags = myPhotoData.tags;
  const mySubjects = myPhotoData.subjects;
  // The user's theme is freeform — find a matching daily challenge for the
  // emoji if possible, otherwise default to ✨ and show the raw theme text.
  const themeMeta = DAILY_CHALLENGES.find(
    (c) =>
      c.id === activeTheme ||
      c.id === rawTheme ||
      c.title.toLowerCase() === rawTheme.toLowerCase(),
  );
  const themeEmoji = themeMeta?.emoji ?? "✨";
  const themeTitle = themeMeta?.title ?? activeTheme;

  const suggestedThemeId = React.useMemo(() => {
    const raw = todaysPhoto?.suggestedTheme?.trim();
    if (!raw) return null;
    const id = resolveChallengeThemeId(raw) || raw;
    if (id === activeTheme) return null;
    return id;
  }, [todaysPhoto?.suggestedTheme, activeTheme]);
  const suggestedThemeMeta = React.useMemo(
    () => DAILY_CHALLENGES.find((c) => c.id === suggestedThemeId),
    [suggestedThemeId],
  );

  // Stable signature of the user's tag list — included in deps so re-uploading
  // the same URI/theme but with different tags re-seeds the candidate pool.
  const myTagsKey = React.useMemo(() => [...myTags].sort().join("|"), [myTags]);

  // Same role for subjects: when `setMyPhotoBackendId` patches the local
  // photo with the authoritative upload-time subjects (often richer
  // than the pre-upload analyze pass), we want the candidate fetch
  // effects to re-run with the corrected `subjects=` query so the deck
  // re-ranks against the right axis. Without this, an empty/weak
  // pre-upload subjects array would lock the deck into a 0-subject
  // ranking even after the patch arrives.
  const mySubjectsKey = React.useMemo(
    () => [...mySubjects].sort().join("|"),
    [mySubjects],
  );

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

  // ---- "Match by object" mode ---------------------------------------------
  // The empty-state ghost button asks the AI to re-tag the user's photo by
  // visible objects only, then re-queries /candidates with those tags so
  // the deck is ranked by what's literally in the frame instead of the
  // usual theme + lifestyle-tag overlap. `objectMatchTags` non-null means
  // we found and applied an object-based pool — the swipe header shows a
  // small banner with the detected objects so the user understands why
  // the matches look different. Cleared when the user uploads a fresh
  // photo (the deps below clear it on theme/tags change).
  const [objectMatchLoading, setObjectMatchLoading] = useState(false);
  const [objectMatchTags, setObjectMatchTags] = useState<string[] | null>(null);
  // Visual-form / shape tags returned alongside the subject tags by the
  // matcher. Stored separately so the banner can show them in their own
  // line (helps the user understand the secondary deck is now ranked
  // 50/50 by subject and shape).
  const [objectMatchShapes, setObjectMatchShapes] = useState<string[]>([]);
  const [objectMatchError, setObjectMatchError] = useState<string | null>(null);

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

  // Real candidates from the backend. Empty until the first fetch resolves;
  // SwipeScreen still renders something via SAMPLE_PHOTOS in dev / a graceful
  // empty state in production.
  const [realPool, setRealPool] = useState<SamplePhoto[]>([]);
  const [usingSuggestedThemeFallback, setUsingSuggestedThemeFallback] =
    useState(false);
  const [suggestedPool, setSuggestedPool] = useState<SamplePhoto[]>([]);
  const sessionSwipeCountRef = useRef(0);
  // URI → backend photo ID, so handleSwipe can post the verdict to the right
  // row. Populated when realPool is loaded; missing entries (e.g. curated
  // SAMPLE_PHOTOS, synthetic candidates) skip the API call cleanly.
  const realPhotoIdsRef = useRef<Map<string, string>>(new Map());

  const runEchoVoteRetry = useCallback((targetPhotoId: string, bid: string) => {
    void votePhoto(targetPhotoId, "same", bid).then((retry) => {
      if (retry.ok) requestAtlasRefresh();
      if (retry.echo === "pending" || retry.echo === "mutual") {
        refreshEchoes();
      }
    });
  }, [refreshEchoes]);

  // If the user swiped "same" before POST /photos returned an id, the first
  // vote could not attach a voter photo and the echo stayed skipped. Replay
  // once today's photo has a backendId so Atlas / inbox see the ripple.
  useEffect(() => {
    const bid = todayBackendIdRef.current;
    if (typeof bid !== "string" || bid.length === 0) return;
    const targets = [...echoRetryPhotoIdsRef.current];
    if (targets.length === 0) return;
    echoRetryPhotoIdsRef.current.clear();
    for (const id of targets) {
      runEchoVoteRetry(id, bid);
    }
  }, [todaysPhoto?.backendId, runEchoVoteRetry]);

  useEffect(() => {
    let cancelled = false;
    fetchCandidates({
      theme: activeTheme,
      tags: myTags,
      // Free-form concrete subjects from the user's own photo. This
      // is the heaviest single signal at scoring time (3 pts × min
      // overlap, 5 = 0..15) — the axis that lets two apple sculptures
      // match each other when neither tags nor theme would carry the
      // overlap. Skipped silently when the photo predates the column.
      subjects: expandSubjectsForQuery(mySubjects),
      // Pass the user's chosen music vibe so the server can boost
      // candidates with the same vibe (theme + lifestyle tags +
      // music vibe = the primary "vibe match" signal).
      musicGenre: todaysPhoto?.musicGenre,
      limit: 24,
      // Hard-exclude every backend photo ID this device knows the
      // user has already been shown. Belt-and-braces over the
      // server-side `seen_photos` table — if a `markPhotosSeen` POST
      // ever dropped (flaky network, app backgrounded mid-flight),
      // this guarantees the photo still won't come back.
      excludeIds: seenPhotoIds,
    })
      .then((cands) => {
        if (cancelled) return;
        const { mapped, ids } = mapFetchedCandidates(cands, activeTheme);
        realPhotoIdsRef.current = ids;
        // Prime the local seen ledger with any candidates whose backend
        // ID is in the server-side seen set. Lets cross-device dedup
        // reflect immediately after install instead of waiting for the
        // user to swipe past those cards locally.
        primeSeenFromCandidates(
          cands.map((c) => ({ id: c.id, uri: c.uri })),
        );
        setRealPool(mapped);
        // Warm only the opening card — the server priority-warms the first few
        // IDs from this response; fanning more here queues concurrent cold
        // resizes and was the main cause of 60s+ photo stalls.
        const first = mapped[0];
        if (first?.uri) void prefetchPhotoUri(first.uri);
      })
      .catch(() => {
        // Keep the last-good deck on a transient fetch failure (API restart /
        // flaky network) so the screen never blanks out — expo-image still
        // renders previously-loaded cards from its disk cache. Only fall back
        // to empty when we have nothing shown yet (the stock/synthetic pool
        // and the stuck-recovery effect still fill the deck in that case).
        if (!cancelled && realPoolRef.current.length === 0) setRealPool([]);
      });
    return () => {
      cancelled = true;
    };
    // mySubjectsKey: see comment on the useMemo. Including it ensures
    // the candidate fetch re-runs after `setMyPhotoBackendId` patches
    // the local photo with the upload-time subjects, so the deck
    // re-ranks against the authoritative subjects.
    // seenPhotoIds: re-fetch when the local seen ledger grows so we never
    // surface a card the device already swiped past (belt over server gaps).
  }, [activeTheme, myTagsKey, mySubjectsKey, seenPhotoIds]);

  useEffect(() => {
    if (!usingSuggestedThemeFallback || !suggestedThemeId) return;
    let cancelled = false;
    fetchCandidates({
      theme: suggestedThemeId,
      tags: myTags,
      subjects: expandSubjectsForQuery(mySubjects),
      musicGenre: todaysPhoto?.musicGenre,
      limit: 24,
      excludeIds: seenPhotoIds,
    })
      .then((cands) => {
        if (cancelled) return;
        const { mapped, ids } = mapFetchedCandidates(cands, suggestedThemeId);
        for (const [uri, id] of ids) {
          realPhotoIdsRef.current.set(uri, id);
        }
        primeSeenFromCandidates(
          cands.map((c) => ({ id: c.id, uri: c.uri })),
        );
        setSuggestedPool(mapped);
        const first = mapped[0];
        if (first?.uri) void prefetchPhotoUri(first.uri);
      })
      .catch(() => {
        // Preserve the last-good suggested pool on a transient failure rather
        // than wiping it (which would drop cards mid-session on an API blip).
        if (!cancelled && suggestedPoolRef.current.length === 0) {
          setSuggestedPool([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    usingSuggestedThemeFallback,
    suggestedThemeId,
    myTagsKey,
    mySubjectsKey,
    todaysPhoto?.musicGenre,
    seenPhotoIds,
  ]);

  const realPoolRef = useRef<SamplePhoto[]>(realPool);
  realPoolRef.current = realPool;
  const suggestedPoolRef = useRef<SamplePhoto[]>(suggestedPool);
  suggestedPoolRef.current = suggestedPool;
  const usingSuggestedThemeFallbackRef = useRef(usingSuggestedThemeFallback);
  usingSuggestedThemeFallbackRef.current = usingSuggestedThemeFallback;
  const suggestedThemeIdRef = useRef<string | null>(suggestedThemeId);
  suggestedThemeIdRef.current = suggestedThemeId;

  // A placeholder rendered before the first real candidate arrives (and as
  // a sentinel when the production pool runs dry — see `noMore` below).
  const PLACEHOLDER_PHOTO: SamplePhoto = React.useMemo(
    () => ({
      id: "placeholder",
      uri: "",
      country: "",
      countryCode: "",
      countryFlag: "",
      theme: activeTheme,
      minutesAgo: 0,
      tags: [],
    }),
    [activeTheme],
  );
  const initial = React.useMemo(
    () => {
      // Wait for the persistent seen-ledger to hydrate before picking a
      // first card. If we pick while `hasHydrated` is still false the
      // exclude set is empty, so we'd surface a stock photo the user may
      // have already swiped — which then visibly self-swaps the instant
      // hydration lands (the "same burger, then it changes on its own"
      // report). Returning null here keeps us on the loading placeholder
      // until the stuck-recovery effect below picks the first *unseen*
      // card (it excludes the hydrated seen-ledger). On a warm start
      // `hasHydrated` is already true, so there's no
      // loading flash. (Cold start is typically a sub-second wait.)
      if (!hasHydrated) return null;
      return getTheirPhoto(
        activeTheme,
        myTags,
        buildExcludeKeys(),
        undefined,
        realPool,
        [],
        mySubjects,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [theirPhoto, setTheirPhoto] = useState(initial?.photo ?? PLACEHOLDER_PHOTO);
  const theirPhotoDisplay = React.useMemo(
    () =>
      photoCountryDisplay(theirPhoto.captureCountryCode, {
        sampleUri: theirPhoto.uri,
      }),
    [theirPhoto.captureCountryCode, theirPhoto.uri],
  );
  const [matchedTheme, setMatchedTheme] = useState<string>(initial?.matchedTheme ?? "");
  const [sharedTags, setSharedTags] = useState<string[]>(initial?.sharedTags ?? []);
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);
  // True when the candidate pool is exhausted (production: no real photos
  // matched the user's theme/tags and we can't fall back to fakes).
  // Only treat a null `initial` as "all caught up" once we've actually
  // hydrated — before that, null just means "still loading the seen-ledger"
  // and we want the loading placeholder card, NOT the empty state.
  const [noMore, setNoMore] = useState<boolean>(hasHydrated && initial == null);
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
  // Mirror of mySubjects so the post-hydration / loadNextCandidate
  // callbacks (which read latest ref values inside stable closures)
  // pick up subjects from the freshest upload without re-creating
  // the callback on every state change.
  const mySubjectsRef = useRef(mySubjects);
  mySubjectsRef.current = mySubjects;
  const myPhotoUriRef = useRef(myPhotoUri);
  myPhotoUriRef.current = myPhotoUri;
  const isAnimatingOutRef = useRef(false);
  const flashMatchRef = useRef<Match | null>(null);
  flashMatchRef.current = flashMatch;

  const deckInteractionBlocked = useCallback(
    () => isAnimatingOutRef.current || flashMatchRef.current != null,
    [],
  );

  const pickDeckCandidate = useCallback(
    (currentKey?: string, excludeExtra?: string) => {
      const theme =
        usingSuggestedThemeFallbackRef.current && suggestedThemeIdRef.current
          ? suggestedThemeIdRef.current
          : activeThemeRef.current;
      const pool = usingSuggestedThemeFallbackRef.current
        ? mergeCandidatePools(realPoolRef.current, suggestedPoolRef.current)
        : realPoolRef.current;
      return getTheirPhoto(
        theme,
        myTagsRef.current,
        buildExcludeKeys(excludeExtra ?? currentKey),
        currentKey,
        pool,
        [],
        mySubjectsRef.current,
      );
    },
    [buildExcludeKeys],
  );

  const tryActivateSuggestedThemeFallback = useCallback((): boolean => {
    if (usingSuggestedThemeFallbackRef.current) return false;
    if (!suggestedThemeIdRef.current) return false;
    const themeRelevant = countThemeRelevantCandidates(
      activeThemeRef.current,
      myTagsRef.current,
      buildExcludeKeys(),
      realPoolRef.current,
      mySubjectsRef.current,
    );
    if (
      !shouldWidenToSuggestedTheme({
        sessionSwipes: sessionSwipeCountRef.current,
        preferredTheme: activeThemeRef.current,
        suggestedTheme: suggestedThemeIdRef.current,
        themeRelevantCount: themeRelevant,
      })
    ) {
      return false;
    }
    usingSuggestedThemeFallbackRef.current = true;
    setUsingSuggestedThemeFallback(true);
    return true;
  }, [buildExcludeKeys]);

  useEffect(() => {
    if (deckInteractionBlocked()) return;
    const currentUri = theirPhotoRef.current?.uri;
    if (!currentUri) return;
    const k = photoKey(currentUri);
    if (!k) return;
    // HARD RULE: the visible card changes ONLY on an explicit user swipe.
    // We never replace a card we've already shown — `sessionDisplayedRef`
    // is the unconditional loop-breaker. Previously a one-shot
    // "post-hydration recheck" bypassed this guard to swap a stale
    // pre-hydration pick. But `markPhotoSeen` writes the current card into
    // the ledger the instant it lands (and `loadState()` folds match-history
    // keys in on hydrate), so by the time that bypass ran the on-screen card
    // was already "seen" — and the bypass yanked it: the photo vanished, its
    // music cut, and the deck auto-advanced with no swipe. The first real
    // card after hydration is now chosen by the stuck-recovery effect below
    // (which already excludes seen photos), so this guard is unconditional.
    if (sessionDisplayedRef.current.has(k)) return;
    if (!seenSet.has(k)) return;
    const next = pickDeckCandidate(k, k);
    if (next) {
      setTheirPhoto(next.photo);
      setMatchedTheme(next.matchedTheme);
      setSharedTags(next.sharedTags);
      setNoMore(false);
    }
  }, [seenSet, buildExcludeKeys, deckInteractionBlocked, pickDeckCandidate]);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const sameLabelOpacity = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const [deckGestureEnabled, setDeckGestureEnabled] = useState(true);

  const setAnimatingOut = useCallback((v: boolean) => {
    isAnimatingOutRef.current = v;
    setDeckGestureEnabled(!v && flashMatchRef.current == null);
  }, []);

  // When the user uploads a new photo (which may carry a new theme/tags),
  // reset the candidate pool so we immediately match against the new
  // context. The persistent ledger still applies — only the per-session
  // bypass flag is reset.
  useEffect(() => {
    bypassSeenRef.current = false;
    sessionDisplayedRef.current = new Set();
    // A new photo means the user's frame has changed — the previously
    // detected objects no longer apply. Clear the object-mode banner
    // and any error so the empty state starts fresh next time.
    setObjectMatchTags(null);
    setObjectMatchShapes([]);
    setObjectMatchError(null);
    sessionSwipeCountRef.current = 0;
    setUsingSuggestedThemeFallback(false);
    setSuggestedPool([]);
    const next = getTheirPhoto(
      activeTheme,
      myTags,
      buildExcludeKeys(),
      undefined,
      realPool,
      [],
      mySubjects,
    );
    if (next) {
      setTheirPhoto(next.photo);
      setMatchedTheme(next.matchedTheme);
      setSharedTags(next.sharedTags);
      setNoMore(false);
    } else {
      setNoMore(true);
    }
    setAnimatingOut(false);
    resetCardMotion(translateX, translateY, cardScale, sameLabelOpacity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPhotoSessionKey, activeTheme, myTagsKey, setAnimatingOut]);

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
    // Single mark call writes both ledgers (photoKey + backendId, when
    // we know it) — the backendId ledger is what subsequent
    // /candidates fetches use as a hard exclusion list, so even a
    // dropped server POST below cannot resurface the photo.
    const backendId = realPhotoIdsRef.current.get(theirPhoto.uri);
    markPhotoSeen(k, backendId);
    // Also mirror the seen-state to the server so dedup follows the
    // user across reinstalls / a second device. Best-effort,
    // fire-and-forget — the local excludeIds list above is the safety
    // net when this drops.
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
  // Lease handed back by the audio singleton for the most recent
  // clip THIS screen started. The unmount cleanup uses it with
  // stopIfLease() so we only stop audio we actually own — never
  // another screen's freshly-started playback.
  const playLeaseRef = useRef<number>(0);
  // True once the candidate's REAL image has actually rendered (not the
  // skeleton, not the stock placeholder). The audio effect below GATES the
  // start of playback on this so a card's vibe only begins once its photo is
  // on screen — image + music land together. Crucially we never flip this
  // back to false for a slow/failed load once the real image has shown, so a
  // late image result can never PAUSE music mid-play (that mid-play pause was
  // the audible "stutter"). Reset to false whenever the displayed candidate
  // changes; the previous card's clip keeps playing smoothly until the new
  // card's image resolves (no gap-pause on the handoff).
  const [candidateImageReady, setCandidateImageReady] = useState(false);
  // After a slow image load, don't leave the previous card's vibe playing
  // forever — open the audio gate after a short timeout so music can advance
  // even when the photo endpoint is backed up.
  const IMAGE_AUDIO_GATE_MS = 2800;
  const [candidateImageGateOpen, setCandidateImageGateOpen] = useState(false);
  // Ref mirror so the focus effect (stable closure) can read the latest
  // ready-state without being re-created and without re-introducing the
  // gate logic — it must apply the same "only start once the image is on
  // screen" rule as the main audio effect.
  const candidateImageGateOpenRef = useRef(candidateImageGateOpen);
  candidateImageGateOpenRef.current = candidateImageGateOpen;
  useEffect(() => {
    setCandidateImageReady(false);
    setCandidateImageGateOpen(false);
    const t = setTimeout(
      () => setCandidateImageGateOpen(true),
      IMAGE_AUDIO_GATE_MS,
    );
    return () => clearTimeout(t);
  }, [theirPhoto.uri]);
  useEffect(() => {
    if (candidateImageReady) setCandidateImageGateOpen(true);
  }, [candidateImageReady]);
  useEffect(() => {
    if (!theirPhoto?.uri) return;
    // Never (re)start the deck's music while the tab is blurred. The blur
    // cleanup already paused playback; if a dep here changes off-screen (a
    // background sync, a late candidate), just stay silent until the user
    // returns and the focus effect restarts the current card's clip.
    if (!isScreenFocusedRef.current) return;
    // Keep the matched card's vibe during the Ripple celebration overlay.
    if (flashMatchRef.current) return;
    // Don't play until the user has uploaded today's photo, over the
    // placeholder card, or once the deck is exhausted.
    if (!todaysPhoto || theirPhoto.id === "placeholder" || noMore) {
      void pauseAudio();
      return;
    }
    // Don't play while a fullscreen image modal is open — the modal is
    // a "look at this in detail" surface, audio competes with that.
    if (fullscreenUri !== null) {
      void pauseAudio();
      return;
    }
    // GATE THE START on the card's real image resolving. We do NOT pause
    // here when the image is still pending/failed — pausing mid-play was the
    // "music stutter" (a clip would start over the skeleton, then get yanked
    // when the image gave up). Instead:
    //   • pending  → return without pausing: the previous card's clip keeps
    //                playing smoothly until this card's photo is on screen.
    //   • failed   → return without pausing: a clearly-failed image simply
    //                never starts this card's vibe (suppressed before play,
    //                not yanked after) — and a slow-but-fine image that
    //                resolves late just starts a touch later, no stutter.
    //   • resolved → start once, below.
    if (!candidateImageGateOpen) return;
    // Single source of truth: `resolveMusicUrl` is the same helper the
    // /reveal screen uses, so the URL we play here is byte-identical to
    // the one /reveal will play after a tap on Open or Share. That's
    // what guarantees the audio singleton dedups (no clip switch / no
    // skip) when the user transitions to the share card.
    const url = resolveMusicUrl({
      customAudioUrl: theirPhoto.customAudioUrl,
      musicGenre: theirPhoto.musicGenre,
      theme: theirPhoto.theme,
      tags: theirPhoto.tags,
      seed: theirPhoto.uri,
    });
    if (url) playLeaseRef.current = playClip(url);
  }, [
    theirPhoto.uri,
    theirPhoto.id,
    theirPhoto.musicGenre,
    theirPhoto.customAudioUrl,
    theirPhoto.theme,
    todaysPhoto,
    noMore,
    fullscreenUri,
    flashMatch,
    candidateImageGateOpen,
  ]);

  // Stop audio when the screen unmounts (tab switch, navigation
  // away) — but ONLY if our last lease is still the active one. A
  // blanket stop() would race the next screen's playback (it might
  // even pick the same clip URL from the small pool) and produce
  // the "blip then silence" bug.
  useEffect(() => {
    return () => {
      void stopIfLease(playLeaseRef.current);
    };
  }, []);

  // When the user opens /reveal we DON'T advance the deck immediately —
  // we want the matched card's music to keep playing through the
  // navigation (the audio singleton dedups on URL, so /reveal playing
  // the same clip is a no-op). Instead we set this flag and run the
  // advance on focus return, which then triggers the music useEffect
  // to switch to the next card's clip.
  const pendingAdvanceRef = useRef(false);
  /** True after a Ripple swipe already advanced the deck under MatchFlash. */
  const deckAdvancedForFlashRef = useRef(false);
  // Latest loadNextCandidate, accessed through a ref so the focus
  // effect below (which is declared before loadNextCandidate) avoids
  // a temporal-dead-zone reference at module evaluation.
  const loadNextCandidateRef = useRef<() => void>(() => {});
  // When the user returns from a push screen (e.g. /reveal), the music
  // useEffect above won't re-fire because its deps haven't changed.
  // This focus effect either advances the deck (if a deferred advance
  // is pending) or restarts the current card's clip after any such
  // return. We skip the very first focus (initial mount) because the
  // music useEffect handles that — avoiding a double-play at startup.
  const musicFocusInitRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!musicFocusInitRef.current) {
        musicFocusInitRef.current = true;
        return;
      }
      if (pendingAdvanceRef.current) {
        pendingAdvanceRef.current = false;
        // loadNextCandidate updates theirPhoto, which the music useEffect
        // picks up and plays the next clip — no need to restart the
        // current clip here, it's about to be replaced.
        loadNextCandidateRef.current();
        return;
      }
      const photo = theirPhotoRef.current;
      if (!photo?.uri || photo.id === "placeholder" || noMore || !todaysPhoto) return;
      // Same start-gate as the main audio effect: never start a clip over a
      // card whose real image hasn't resolved (still skeleton / stock).
      if (!candidateImageGateOpenRef.current) return;
      const url = resolveMusicUrl({
        customAudioUrl: photo.customAudioUrl,
        musicGenre: photo.musicGenre,
        theme: photo.theme,
        tags: photo.tags,
        seed: photo.uri,
      });
      if (url) playLeaseRef.current = playClip(url);
    }, [noMore, todaysPhoto]),
  );

  const toggleMute = useCallback(() => {
    const next = !audioIsMuted();
    setAudioMuted(next);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const prefetchInflightRef = useRef(new Set<string>());
  const prefetchPhotoUri = useCallback((uri: string) => {
    const normalized = withDisplayPhotoWidth(normalizeUnsplashUri(uri));
    if (!normalized) return Promise.resolve();
    if (prefetchInflightRef.current.has(normalized)) {
      return Promise.resolve();
    }
    prefetchInflightRef.current.add(normalized);
    const release = () => {
      prefetchInflightRef.current.delete(normalized);
    };
    if (explorePhotoUriNeedsAuth(normalized)) {
      return authedImageHeaders()
        .then((headers) => Image.prefetch(normalized, { headers }))
        .catch(() => {})
        .finally(release);
    }
    return Image.prefetch(normalized).catch(() => {}).finally(release);
  }, []);

  // Audio analogue of prefetchPhotoUri: preload an upcoming card's vibe
  // clip so swiping to it starts the music with no fetch/decode delay.
  // We resolve the URL through the SAME `resolveMusicUrl` the playback
  // effect uses (byte-identical seed = photo.uri), so the clip we prewarm
  // is exactly the one we'll later play — guaranteeing a prewarm-cache
  // hit. The audio singleton keeps the cache bounded + best-effort.
  const prewarmAudioForPhoto = useCallback(
    (photo: {
      uri: string;
      musicGenre?: string;
      customAudioUrl?: string;
      theme?: string;
      tags?: string[];
    }) => {
      const url = resolveMusicUrl({
        customAudioUrl: photo.customAudioUrl,
        musicGenre: photo.musicGenre,
        theme: photo.theme,
        tags: photo.tags,
        seed: photo.uri,
      });
      if (url) prewarmClip(url);
    },
    [],
  );

  const prefetchDeckAhead = useCallback(
    (count: number, afterUri?: string) => {
      let skipKey = afterUri
        ? photoKey(afterUri)
        : photoKey(theirPhotoRef.current.uri);
      for (let i = 0; i < count; i++) {
        const pick = pickDeckCandidate(skipKey, skipKey);
        if (!pick?.photo.uri) break;
        void prefetchPhotoUri(pick.photo.uri);
        skipKey = photoKey(pick.photo.uri);
      }
    },
    [buildExcludeKeys, prefetchPhotoUri, pickDeckCandidate],
  );

  const loadNextCandidate = useCallback(() => {
    const currentUri = theirPhotoRef.current.uri;
    const currentKey = photoKey(currentUri);
    sessionSwipeCountRef.current += 1;
    tryActivateSuggestedThemeFallback();
    const next = pickDeckCandidate(currentKey, currentKey);
    // Warm only the card that's about to land. Fanning more out here (this
    // ran twice before) floods the single-CPU image endpoint with concurrent
    // sharp jobs, which is what made every photo crawl in. The deck ahead is
    // warmed once, after the swap, below.
    if (next?.photo.uri) {
      void prefetchPhotoUri(next.photo.uri);
    }
    // Card is still off-screen from swipe-out — swap photos before resetting
    // transform so the old image never flashes at center.
    const applyNext = () => {
      if (next) {
        setTheirPhoto(next.photo);
        setMatchedTheme(next.matchedTheme);
        setSharedTags(next.sharedTags);
        setNoMore(false);
        prefetchDeckAhead(1, next.photo.uri);
      } else {
        setNoMore(true);
      }
      resetCardMotion(translateX, translateY, cardScale, sameLabelOpacity);
      setAnimatingOut(false);
    };
    InteractionManager.runAfterInteractions(applyNext);
  }, [
    translateX,
    translateY,
    cardScale,
    sameLabelOpacity,
    buildExcludeKeys,
    prefetchPhotoUri,
    prefetchDeckAhead,
    setAnimatingOut,
    pickDeckCandidate,
    tryActivateSuggestedThemeFallback,
  ]);

  // Warm the next card in the deck so the swap does not flash a blank pane.
  useEffect(() => {
    if (noMore || theirPhoto.id === "placeholder") return;
    const currentKey = photoKey(theirPhoto.uri);
    const next = pickDeckCandidate(currentKey, currentKey);
    if (next?.photo.uri) {
      void prefetchPhotoUri(next.photo.uri);
      // Preload the next card's vibe so a swipe to it plays music instantly
      // instead of waiting on an on-demand network fetch + decode.
      prewarmAudioForPhoto(next.photo);
    }
    // Next card only — prefetchDeckAhead here used to stack 3+ concurrent
    // cold image jobs on the server and stall the visible card.
  }, [
    theirPhoto.uri,
    theirPhoto.id,
    noMore,
    pickDeckCandidate,
    prefetchPhotoUri,
    prewarmAudioForPhoto,
  ]);

  // Warm-on-focus: when the Ripple tab regains focus the per-card prefetch
  // effects above don't re-run (theirPhoto.uri is unchanged after returning
  // from another tab), so upcoming cards can be cold. Re-warm the current card
  // plus a small lead of upcoming cards so the first swipes after focus stay
  // warm. Image.prefetch is idempotent/cached, so one card ahead is enough
  // and never re-downloads what's already warm — no over-fetch.
  useFocusEffect(
    useCallback(() => {
      // Pay the audio-session setup cost (setAudioModeAsync) up front so the
      // first vibe clip after focus doesn't carry that fixed delay inline.
      // Opening Ripple counts as consent for vibe clips (tab tap is a gesture).
      markUserInteracted();
      warmAudioSession();
      const current = theirPhotoRef.current;
      if (current?.uri && current.id !== "placeholder") {
        void prefetchPhotoUri(current.uri);
        // Preload the upcoming card's vibe too so the first swipe after
        // returning to Ripple starts its music instantly.
        const next = pickDeckCandidate(
          photoKey(current.uri),
          photoKey(current.uri),
        );
        if (next?.photo.uri) prewarmAudioForPhoto(next.photo);
      }
      prefetchDeckAhead(1);
    }, [
      prefetchPhotoUri,
      prefetchDeckAhead,
      pickDeckCandidate,
      prewarmAudioForPhoto,
    ]),
  );

  const handleSwipeRef = useRef<
    (dir: "left" | "right", animateOut?: boolean) => void
  >(() => {});
  const swipeOutCompleteRef = useRef<(() => void) | null>(null);
  const runSwipeOutComplete = useCallback(() => {
    swipeOutCompleteRef.current?.();
    swipeOutCompleteRef.current = null;
  }, []);
  const invokeSwipeFromGesture = useCallback((dir: "left" | "right") => {
    handleSwipeRef.current(dir, false);
  }, []);

  const handleSwipe = useCallback(
    (dir: "left" | "right", animateOut = true) => {
      if (isAnimatingOutRef.current) return;
      // Don't record a swipe when there's nothing to swipe on.
      if (noMore) return;
      setAnimatingOut(true);

      // A swipe is an explicit user gesture — open the audio gate so
      // the reveal effect's playClip() actually plays.
      markUserInteracted();

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
      const snapshotMyCapturedAt = myPhotoData.capturedAt;
      // Snapshot the matched photo's ABSOLUTE temporal basis at swipe time so
      // the calendar tier is computed from fixed instants (kills the old
      // drift bug). Their real capture time when known; otherwise their
      // upload/share time, derived once here from the frozen `minutesAgo`
      // for sample candidates that carry no real timestamp.
      const snapshotTheirCapturedAt = snapshotPhoto.capturedAt;
      const snapshotTheirSharedAt =
        snapshotPhoto.createdAt ??
        new Date(Date.now() - snapshotPhoto.minutesAgo * 60000).toISOString();

      prefetchDeckAhead(1, snapshotPhoto.uri);

      const onSwipeOutComplete = () => {
        const voterPhotoId = pickVoterPhotoBackendId(myPhotos, {
          uploadedAt: snapshotMyUploadedAt,
          preferUri: snapshotMyUri,
        });
        const snapshotMyPhoto =
          voterPhotoId && voterPhotoId.length > 0
            ? serverPhotoImageUrl(voterPhotoId)
            : snapshotMyUri;
        // Build a match record for BOTH verdicts so the user can revisit
        // and flip a previous swipe from My Journey. Stats / countries /
        // badges only count "same" — the context handles that branching.
        const myDisp = photoCountryDisplay(todaysPhoto?.captureCountryCode, {
          sampleUri: todaysPhoto?.uri,
        });
        const theirDisp = photoCountryDisplay(snapshotPhoto.captureCountryCode, {
          sampleUri: snapshotPhoto.uri,
        });
        const match: Match = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          myPhoto: snapshotMyPhoto,
          theirPhoto: snapshotPhoto.uri,
          myCountry: myDisp.name,
          myCountryCode: myDisp.code,
          myCountryFlag: myDisp.flag,
          theirCountry: theirDisp.name,
          theirCountryFlag: theirDisp.flag,
          theirCountryCode: theirDisp.code ?? "",
          myCaptureCountryCode: todaysPhoto?.captureCountryCode,
          theirCaptureCountryCode: snapshotPhoto.captureCountryCode,
          similarityScore: 0,
          verdict: dir === "right" ? "same" : "different",
          timestamp: new Date().toISOString(),
          theme: snapshotTheme,
          theirPhotoMinutesAgo: snapshotPhoto.minutesAgo,
          theirPhotoCapturedAt: snapshotTheirCapturedAt,
          theirPhotoSharedAt: snapshotTheirSharedAt,
          myPhotoUploadedAt: snapshotMyUploadedAt,
          myPhotoCapturedAt: snapshotMyCapturedAt,
          sharedTags: snapshotShared,
          theirVibe: expandToVibe(snapshotPhoto.tags ?? [], snapshotPhoto.uri),
          theirMusicGenre: snapshotPhoto.musicGenre,
          theirCustomAudioUrl: snapshotPhoto.customAudioUrl,
          theirActualTheme: snapshotPhoto.theme,
          theirTags: snapshotPhoto.tags,
          theirMusicUrl: resolveMusicUrl({
            customAudioUrl: snapshotPhoto.customAudioUrl,
            musicGenre: snapshotPhoto.musicGenre,
            theme: snapshotPhoto.theme,
            tags: snapshotPhoto.tags,
            seed: snapshotPhoto.uri,
          }) ?? undefined,
        };
        const liveId = realPhotoIdsRef.current.get(snapshotPhoto.uri);
        const hadNoVoterPhotoId = !voterPhotoId;
        const matchWithStats: Match =
          dir === "right"
            ? {
                ...match,
                ...(liveId ? { theirPhotoId: liveId } : {}),
                ...(voterPhotoId ? { myPhotoId: voterPhotoId } : {}),
                matchStats: sampleMatchStats(snapshotPhoto.uri),
              }
            : {
                ...match,
                ...(liveId ? { theirPhotoId: liveId } : {}),
                ...(voterPhotoId ? { myPhotoId: voterPhotoId } : {}),
              };
        stashMatchPhotoUris(
          matchWithStats.id,
          matchWithStats.myPhoto,
          matchWithStats.theirPhoto,
        );
        addMatch(matchWithStats);
        if (liveId) {
          const voterPhotoIdForVote = todaysPhoto?.backendId ?? voterPhotoId;
          const voterIdAtSwipe = voterPhotoId || voterPhotoIdForVote;
          if (voterIdAtSwipe) {
            void rememberVoterPhotoForTarget(
              liveId,
              voterIdAtSwipe,
              snapshotPhoto.uri,
            );
          }
          votePhoto(
            liveId,
            dir === "right" ? "same" : "different",
            voterPhotoIdForVote,
          )
            .then((result) => {
              if (result.ok) requestAtlasRefresh();
              const bidNow =
                result.voterPhotoId ||
                todayBackendIdRef.current ||
                voterPhotoIdForVote;
              if (result.ok && bidNow) {
                void rememberVoterPhotoForTarget(
                  liveId,
                  bidNow,
                  snapshotPhoto.uri,
                );
                patchMatchVoterPhoto(matchWithStats.id, bidNow, liveId);
              }
              if (
                hadNoVoterPhotoId &&
                result.ok &&
                dir === "right" &&
                result.echo === "skipped"
              ) {
                if (typeof bidNow === "string" && bidNow.length > 0) {
                  runEchoVoteRetry(liveId, bidNow);
                } else {
                  echoRetryPhotoIdsRef.current.add(liveId);
                }
              }
              if (result.echo === "pending" || result.echo === "mutual") {
                refreshEchoes();
              }
            })
            .catch(() => {});
        }
        if (dir === "right") {
          // Celebration overlay — leave card off-screen; advance deck on dismiss.
          setFlashMatch(matchWithStats);
          deckAdvancedForFlashRef.current = false;
          sameLabelOpacity.value = 0;
          setAnimatingOut(false);
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
          loadNextCandidate();
        }
      };

      swipeOutCompleteRef.current = onSwipeOutComplete;

      if (animateOut) {
        playSwipeOutAnimation(
          dir,
          translateX,
          translateY,
          cardScale,
          () => {
            "worklet";
            runOnJS(runSwipeOutComplete)();
          },
        );
      }
    },
    [
      sharedTags,
      myPhotoData.uploadedAt,
      myPhotos,
      translateX,
      cardScale,
      sameLabelOpacity,
      loadNextCandidate,
      addMatch,
      patchMatchVoterPhoto,
      myCountryCode,
      todaysPhoto?.backendId,
      todaysPhoto?.captureCountryCode,
      runEchoVoteRetry,
      prefetchDeckAhead,
      runSwipeOutComplete,
      setAnimatingOut,
      noMore,
      refreshEchoes,
    ]
  );

  // Keep the ref pointing at the latest loadNextCandidate so the focus
  // effect (declared above) can call it without a TDZ reference.
  useEffect(() => {
    loadNextCandidateRef.current = loadNextCandidate;
  }, [loadNextCandidate]);

  handleSwipeRef.current = handleSwipe;

  const panGesture = Gesture.Pan()
    .enabled(deckGestureEnabled)
    .activeOffsetX([-6, 6])
    .failOffsetY([-100, 100])
    .onBegin(() => {
      panStartX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = panStartX.value + e.translationX;
      translateY.value = e.translationY * 0.08;
      const progress = Math.abs(translateX.value) / SWIPE_DISTANCE_THRESHOLD;
      sameLabelOpacity.value =
        translateX.value > 0 ? Math.min(progress, 1) : 0;
    })
    .onEnd((e) => {
      const dx = translateX.value;
      const vx = e.velocityX;
      if (shouldCommitHorizontalSwipe(dx, vx)) {
        const goRight =
          Math.abs(dx) >= SWIPE_DISTANCE_THRESHOLD ? dx > 0 : vx > 0;
        const dir = goRight ? "right" : "left";
        playSwipeOutAnimation(
          dir,
          translateX,
          translateY,
          cardScale,
          () => {
            "worklet";
            runOnJS(runSwipeOutComplete)();
          },
        );
        runOnJS(invokeSwipeFromGesture)(dir);
      } else {
        translateX.value = withSpring(0, SNAP_BACK_SPRING);
        translateY.value = withSpring(0, SNAP_BACK_SPRING);
        sameLabelOpacity.value = withTiming(0, { duration: 100 });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-width / 2, 0, width / 2],
          [-7, 0, 7],
        )}deg`,
      },
      { scale: cardScale.value },
    ],
  }));

  const sameLabelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sameLabelOpacity.value,
  }));

  useEffect(() => {
    setDeckGestureEnabled(!isAnimatingOutRef.current && flashMatch == null);
  }, [flashMatch]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarClearance =
    Platform.OS === "web" ? 90 : tabBarTotalHeight(insets);
  // Treat the user as "no photo for today" if their last upload is from a
  // previous UTC day — this makes Start Matching prompt for a fresh photo
  // each new daily-challenge cycle instead of recycling yesterday's.
  const hasUploadedPhoto = todaysPhoto !== undefined;

  // Production builds used to mount with realPool=[] and stock off, so
  // `initial` was null → permanent "all caught up" even after /candidates
  // returned. Re-pick when the live pool fills or we're on placeholder/empty.
  useEffect(() => {
    if (!hasHydrated || !hasUploadedPhoto) return;
    if (deckInteractionBlocked()) return;
    const stuck =
      noMore || theirPhotoRef.current.id === "placeholder";
    if (!stuck) return;
    const next = pickDeckCandidate(
      photoKey(theirPhotoRef.current.uri) || undefined,
      photoKey(theirPhotoRef.current.uri) || undefined,
    );
    if (next) {
      setTheirPhoto(next.photo);
      setMatchedTheme(next.matchedTheme);
      setSharedTags(next.sharedTags);
      setNoMore(false);
    }
  }, [
    hasHydrated,
    hasUploadedPhoto,
    realPool.length,
    noMore,
    buildExcludeKeys,
    myTagsKey,
    mySubjectsKey,
    activeTheme,
    deckInteractionBlocked,
    pickDeckCandidate,
    usingSuggestedThemeFallback,
    suggestedPool.length,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View style={{ flex: 1, marginRight: 12, minWidth: 0 }}>
          <EchoLogo
            size="sm"
            color={colors.foreground}
            taglineColor={colors.mutedForeground}
          />
          <Text
            style={[
              styles.subtitle,
              { color: colors.mutedForeground, marginTop: 4 },
            ]}
          >
            {streakCount > 0 ? `${streakCount} matches` : "Find your similar"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <PressableScale
            onPress={toggleMute}
            haptic="selection"
            scaleTo={0.92}
            style={[
              styles.cameraBtn,
              {
                backgroundColor: colors.cardElevated,
              },
              colors.shadows.sm,
            ]}
            accessibilityLabel={muted ? "Unmute vibe music" : "Mute vibe music"}
          >
            <Icon
              name={muted ? "volumeX" : "volume2"}
              size={18}
              color={colors.foreground}
            />
          </PressableScale>
          <PressableScale
            onPress={() => router.push("/camera")}
            haptic="medium"
            scaleTo={0.92}
            style={[
              styles.cameraBtn,
              { backgroundColor: colors.primary },
              colors.shadows.glowPrimary,
            ]}
            accessibilityLabel="Take a new photo"
          >
            <Icon name="camera" size={20} color="#fff" />
          </PressableScale>
        </View>
      </View>

      {!hasUploadedPhoto ? (
        <View style={[styles.challengeBar, { borderColor: colors.border }]}>
          <Text style={styles.challengeEmoji}>{todaysChallenge.emoji}</Text>
          <Text style={[styles.challengeText, { color: colors.mutedForeground }]}>
            {"Today's prompt: "}
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
              {todaysChallenge.title}
            </Text>
          </Text>
        </View>
      ) : null}

      <View style={[styles.cardArea, { paddingBottom: tabBarClearance }]}>
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
            <PressableScale
              onPress={() => router.push("/camera")}
              haptic="medium"
              style={[styles.emptyCta, colors.shadows.glowPrimary]}
            >
              <GradientCard
                gradient="primary"
                radius="pill"
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyCtaInner}
              >
                <Icon name="camera" size={18} color="#fff" />
                <Text style={styles.emptyCtaText}>Add your photo</Text>
              </GradientCard>
            </PressableScale>
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
                You've seen all the similar vibes we have right now. Post a new photo to start a fresh session, or try matching by subject matter.
              </Text>
              <PressableScale
                onPress={() => router.push("/camera")}
                haptic="medium"
                style={[styles.emptyStateBtn, colors.shadows.glowPrimary]}
              >
                <GradientCard
                  gradient="primary"
                  radius="pill"
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.emptyStateBtnInner}
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
                </GradientCard>
              </PressableScale>
              <PressableScale
                onPress={async () => {
                  // "Match by object" — alternative AI matching strategy.
                  // Asks the server to re-tag the user's own photo using
                  // an object-focused vision pass, then re-queries
                  // /candidates with those tags only (no theme), so the
                  // deck is ranked by what's literally visible in the
                  // frame instead of the usual theme + lifestyle-tag
                  // overlap. The user gets a fresh pool to swipe through
                  // when the strict pool is exhausted.
                  const photoId = todaysPhoto?.backendId;
                  if (!photoId) {
                    // No backendId means the upload hasn't returned an id
                    // yet. Distinguish in-flight from failed so the user
                    // gets an actionable message instead of "still
                    // uploading" forever — the failure mode that left
                    // v1.2.4 testers stuck.
                    if (todaysPhoto?.uploadState === "failed") {
                      setObjectMatchError(
                        "Your photo didn't reach the server. Post it again from the camera tab to retry.",
                      );
                    } else {
                      setObjectMatchError(
                        "Your photo is still uploading — try again in a few seconds.",
                      );
                    }
                    return;
                  }
                  setObjectMatchLoading(true);
                  setObjectMatchError(null);
                  let objects: string[];
                  let shapes: string[];
                  try {
                    const result = await matchByObject(photoId);
                    objects = result.objects;
                    shapes = result.shapes;
                  } catch (e) {
                    const msg =
                      e instanceof Error ? e.message : "Unknown error";
                    setObjectMatchError(
                      msg.includes("match-by-object failed")
                        ? msg
                        : "Couldn't reach the matcher. Try again in a moment.",
                    );
                    setObjectMatchLoading(false);
                    return;
                  }
                  // Empty subject *and* empty shapes → AI saw nothing
                  // usable. If either side has values we can still
                  // re-rank: shapes alone surface visually-similar
                  // photos even when no concrete subject was spotted.
                  if (objects.length === 0 && shapes.length === 0) {
                    setObjectMatchError(
                      "Couldn't spot any clear objects in your photo.",
                    );
                    setObjectMatchLoading(false);
                    return;
                  }
                  try {
                    const cands = await fetchCandidates({
                      // Subject matter mode: send the AI-detected
                      // objects as `subjects=` (free-form, heaviest
                      // weight at scoring time — 3 pts × min(overlap,
                      // 5) = 0..15) and the shape tags alongside so
                      // the server still has a second axis to break
                      // ties on. Tags is left empty: the constrained
                      // lifestyle vocabulary can't represent concrete
                      // nouns like "apple" / "sculpture" anyway and
                      // sending objects there would double-count
                      // against the same candidates the subjects axis
                      // already promoted.
                      subjects: expandSubjectsForQuery(objects),
                      shapes,
                      limit: 24,
                      // Same hard exclusion as the primary deck — we never
                      // want a previously-shown photo to resurface just
                      // because the user re-queried by subject matter.
                      excludeIds: seenPhotoIds,
                    });
                    const ids = new Map<string, string>();
                    const exclude = buildExcludeKeys();
                    const mapped: SamplePhoto[] = cands.map((c) => {
                      const capture =
                        typeof c.captureCountryCode === "string" &&
                        c.captureCountryCode.length === 2
                          ? c.captureCountryCode.toUpperCase()
                          : undefined;
                      const disp = photoCountryDisplay(capture);
                      const minutesAgo = Math.max(
                        1,
                        Math.round(
                          (Date.now() - new Date(c.createdAt).getTime()) /
                            60000,
                        ),
                      );
                      ids.set(c.uri, c.id);
                      return {
                        id: `live-${c.id}`,
                        uri: c.uri,
                        country: disp.name,
                        countryCode: disp.code ?? "",
                        countryFlag: disp.flag,
                        captureCountryCode: capture,
                        theme: c.theme || activeTheme,
                        minutesAgo,
                        capturedAt: c.capturedAt ?? undefined,
                        createdAt:
                          typeof c.createdAt === "string" ? c.createdAt : undefined,
                        tags: c.tags,
                        // Same as the primary deck — forward shapeTags
                        // so the local re-rank in subject-mode (which
                        // passes `shapes` as myShapes) actually scores
                        // candidate-side shape overlap instead of 0.
                        shapes: c.shapeTags,
                        // And forward subjects so the local re-rank
                        // can credit subject overlap against the
                        // AI-detected `objects` we passed in below as
                        // `mySubjects`. Without this, the heaviest
                        // axis would be 0 on the client even though
                        // the server already used it for ranking.
                        subjects: c.subjects,
                        musicGenre: c.musicGenre ?? undefined,
                        customAudioUrl: c.customAudioUrl ?? undefined,
                      };
                    });
                    // Merge the new IDs into the existing lookup so vote
                    // posts still find the right backend ID after a swipe.
                    for (const [uri, id] of ids) {
                      realPhotoIdsRef.current.set(uri, id);
                    }
                    primeSeenFromCandidates(
                      cands.map((c) => ({ id: c.id, uri: c.uri })),
                    );
                    // Drop the user's own photo and any already-seen
                    // candidates from the new pool before showing one.
                    const fresh = mapped.filter((p) => {
                      const k = photoKey(p.uri);
                      return !!k && !exclude.has(k);
                    });
                    if (fresh.length === 0) {
                      setObjectMatchError(
                        "No fresh matches for those objects yet.",
                      );
                      return;
                    }
                    setObjectMatchTags(objects);
                    setObjectMatchShapes(shapes);
                    setRealPool(fresh);
                    // Pick a candidate immediately so the user sees a
                    // result without another tap. We deliberately
                    // *replace* the ranking inputs in subject-matter
                    // mode so the local re-rank reflects what the user
                    // just asked for. Mirrors the server's matching
                    // SQL exactly so client and server agree:
                    //   • preferredTheme = "" → no theme contribution
                    //     (the user explicitly opted out of theme).
                    //   • myTags        = []  → no vibe-overlap term;
                    //     constrained lifestyle tags don't carry the
                    //     concrete-noun signal we care about here.
                    //   • myShapes      = shapes  → shape-overlap term.
                    //   • mySubjects    = objects → subject-overlap term
                    //     (heaviest single axis, 0..15 pts).
                    const next = getTheirPhoto(
                      "",
                      [],
                      exclude,
                      undefined,
                      fresh,
                      shapes,
                      objects,
                    );
                    if (next) {
                      setTheirPhoto(next.photo);
                      setMatchedTheme(next.matchedTheme);
                      setSharedTags(next.sharedTags);
                      setNoMore(false);
                    }
                  } catch {
                    setObjectMatchError("Subject matter match failed. Try again.");
                  } finally {
                    setObjectMatchLoading(false);
                  }
                }}
                disabled={objectMatchLoading}
                haptic="light"
                style={[
                  styles.emptyStateBtn,
                  { marginTop: 10, opacity: objectMatchLoading ? 0.6 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.emptyStateBtnInner,
                    styles.emptyStateBtnGhost,
                    { borderColor: colors.border },
                  ]}
                >
                  {objectMatchLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.mutedForeground}
                    />
                  ) : (
                    <>
                      <Icon
                        name="shuffle"
                        size={16}
                        color={colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.emptyStateBtnText,
                          { color: colors.mutedForeground, marginLeft: 8 },
                        ]}
                      >
                        Subject matter match
                      </Text>
                    </>
                  )}
                </View>
              </PressableScale>
              {objectMatchError && (
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 12,
                    marginTop: 8,
                    textAlign: "center",
                  }}
                >
                  {objectMatchError}
                </Text>
              )}
            </View>
          </View>
        )}
        {hasUploadedPhoto && !noMore && usingSuggestedThemeFallback && suggestedThemeId && (
          <View
            style={{
              alignSelf: "center",
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              also matching {suggestedThemeMeta?.emoji ?? "✨"}{" "}
              {suggestedThemeMeta?.title ?? suggestedThemeId} — your theme{" "}
              {themeEmoji} {themeTitle} first
            </Text>
          </View>
        )}
        {hasUploadedPhoto && !noMore && objectMatchTags && objectMatchTags.length > 0 && (
          <View
            style={{
              alignSelf: "center",
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              matching by subject matter: {objectMatchTags.join(", ")}
              {objectMatchShapes.length > 0
                ? ` · shapes: ${objectMatchShapes.join(", ")}`
                : ""}
            </Text>
          </View>
        )}
        {hasUploadedPhoto && !noMore && (
        <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[styles.cardWrapper, cardAnimatedStyle]}
        >
          <Reanimated.View
            style={[
              styles.sameLabel,
              sameLabelAnimatedStyle,
              { borderColor: colors.teal },
            ]}
          >
            <Text style={[styles.labelText, { color: colors.teal }]}>
              WAVE
            </Text>
          </Reanimated.View>

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
              <RemotePhotoImage
                uri={myPhotoUri}
                fallbackUri={myPhotoFallbackUri}
                style={styles.fillPhoto}
                resizeMode="cover"
                transitionMs={0}
                recyclingKey={myPhotoRecyclingKey}
              />
              {isAiPhoto(myPhotoUri) ? <AiGeneratedBadge size="sm" /> : null}
              {myPhotoDisplay.code ? (
                <View
                  style={[styles.photoCountryBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}
                  accessibilityLabel={`Posted from ${myPhotoDisplay.name}`}
                >
                  <Text style={styles.photoCountryBadgeText}>
                    {myPhotoDisplay.flag}
                  </Text>
                </View>
              ) : null}
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
              onPress={() =>
                theirPhoto.id !== "placeholder" && theirPhoto.uri
                  ? setFullscreenUri(theirPhoto.uri)
                  : undefined
              }
            >
              {theirPhoto.id === "placeholder" || !theirPhoto.uri ? (
                <View style={[styles.fillPhoto, styles.candidateLoadingPane]}>
                  <ActivityIndicator color={colors.mutedForeground} />
                </View>
              ) : (
              <RemotePhotoImage
                uri={theirPhoto.uri}
                style={styles.fillPhoto}
                resizeMode="cover"
                transitionMs={0}
                recyclingKey={`match-their:${photoKey(theirPhoto.uri)}`}
                onResolved={(ok) => {
                  // Only flip to "ready" on a successful real-image load.
                  // A failed/placeholder result (ok === false) is ignored so
                  // it can never PAUSE music that's already playing — it just
                  // leaves this card's vibe gated (never started), avoiding
                  // the mid-play stutter.
                  if (ok) setCandidateImageReady(true);
                }}
              />
              )}
              {theirPhoto.uri ? (
                <>
              {isSamplePhoto(theirPhoto.uri) ? (
                <StockPhotoWatermark size="md" />
              ) : null}
              <MatchPhotoDevOverlay
                uri={theirPhoto.uri}
                candidateId={theirPhoto.id}
                theme={theirPhoto.theme}
                matchedTheme={matchedTheme}
                style={
                  isSamplePhoto(theirPhoto.uri) ? { top: 54 } : undefined
                }
              />
              {/* Mic badge — when the other user attached a custom voice
                  clip to their photo, surface it here so the listener
                  can preview it independently of the auto-play music
                  loop. The clip auto-plays via the existing
                  customAudioUrl handler in playClip(); the badge gives
                  the user visible play/pause control. */}
              {theirPhoto.customAudioUrl ? (
                <View style={styles.micBadgeOverlay}>
                  <MicBadge audioUrl={theirPhoto.customAudioUrl} size="sm" />
                </View>
              ) : null}
              {theirPhotoDisplay.code ? (
                <View
                  style={[styles.photoCountryBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}
                  accessibilityLabel={`Posted from ${theirPhotoDisplay.name}`}
                >
                  <Text style={styles.photoCountryBadgeText}>
                    {theirPhotoDisplay.flag}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.expandHint, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
                <Icon name="maximize" size={12} color="#fff" />
              </View>
              {sharedTags.length > 0 && (
                <View
                  style={[styles.sharedTagsChip, { backgroundColor: colors.teal + "f2" }]}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={sharedTags
                    .slice(0, 3)
                    .map((id) => {
                      const t = TAG_LIBRARY.find((x) => x.id === id);
                      return t ? `${t.label}` : id;
                    })
                    .join(", ")}
                >
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
                </>
              ) : null}
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
                disabled={flashMatch != null}
                activeOpacity={0.8}
                accessibilityLabel="Skip"
              >
                <Icon name="x" size={26} color="#fff" />
              </TouchableOpacity>

              <View style={{ flex: 1 }} pointerEvents="none" />

              <TouchableOpacity
                style={[styles.actionBtn, styles.matchBtn, { backgroundColor: colors.teal }]}
                onPress={() => handleSwipe("right")}
                disabled={flashMatch != null}
                activeOpacity={0.85}
                accessibilityLabel="Send ripple"
                accessibilityHint="Sends a Ripple on this photo. When they Ripple back, it becomes a Wave."
              >
                <Icon name="ripple" size={30} color="#001018" />
              </TouchableOpacity>
            </View>
          </View>
        </Reanimated.View>
        </GestureDetector>
        )}
      </View>

      {/* Celebration overlay — deck advances under it on Ripple swipe. */}
      {flashMatch && (() => {
        const themeMeta = DAILY_CHALLENGES.find(
          (c) => c.id === flashMatch.theme || c.title.toLowerCase() === flashMatch.theme,
        );
        return (
          <MatchFlash
            theirCountry={flashMatch.theirCountry}
            theirCountryFlag={flashMatch.theirCountryFlag}
            theirCountryCode={flashMatch.theirCountryCode}
            myCountryFlag={flashMatch.myCountryFlag ?? myPhotoDisplay.flag}
            myCountryCode={flashMatch.myCountryCode ?? myPhotoDisplay.code}
            myCaptureCountryCode={flashMatch.myCaptureCountryCode}
            theirCaptureCountryCode={flashMatch.theirCaptureCountryCode}
            themeTitle={themeMeta?.title ?? flashMatch.theme ?? "the same thing"}
            themeEmoji={themeMeta?.emoji ?? "✨"}
            myPhotoUri={flashMatch.myPhoto}
            myPhotoFallbackUri={
              flashMatch.myPhotoId
                ? serverPhotoImageUrl(flashMatch.myPhotoId)
                : myPhotoFallbackUri
            }
            theirPhotoUri={flashMatch.theirPhoto}
            myPhotoCapturedAt={flashMatch.myPhotoCapturedAt}
            myPhotoSharedAt={flashMatch.myPhotoUploadedAt}
            theirPhotoCapturedAt={flashMatch.theirPhotoCapturedAt}
            theirPhotoSharedAt={flashMatch.theirPhotoSharedAt}
            onDone={() => {
              setFlashMatch(null);
              loadNextCandidate();
              deckAdvancedForFlashRef.current = false;
            }}
            onOpenFull={(action) => {
              const data = flashMatch;
              const matchId = String(data.id);
              stashMatchPhotoUris(matchId, data.myPhoto, data.theirPhoto);
              setFlashMatch(null);
              const alreadyAdvanced = deckAdvancedForFlashRef.current;
              deckAdvancedForFlashRef.current = false;
              // If the deck did not advance yet, defer until return from
              // /reveal so matched-card music can continue through navigation.
              if (!alreadyAdvanced) {
                pendingAdvanceRef.current = true;
              }
              router.push({
                pathname: "/reveal",
                params: {
                  matchId,
                  ...(action ? { action } : {}),
                },
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
            <View style={styles.fullscreenImageWrap}>
              <RemotePhotoImage
                uri={fullscreenUri}
                fallbackUri={
                  fullscreenUri === myPhotoUri ? myPhotoFallbackUri : undefined
                }
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
              {isAiPhoto(fullscreenUri) ? (
                <AiGeneratedBadge
                  size="md"
                  style={{ top: insets.top + 14, right: 56 }}
                />
              ) : null}
              {isSamplePhoto(fullscreenUri) ? (
                <StockPhotoWatermark
                  size="lg"
                  style={{ top: insets.top + 14, left: 16 }}
                />
              ) : null}
              {fullscreenUri && theirPhoto.uri === fullscreenUri ? (
                <MatchPhotoDevOverlay
                  uri={fullscreenUri}
                  candidateId={theirPhoto.id}
                  theme={theirPhoto.theme}
                  matchedTheme={matchedTheme}
                  style={{ top: insets.top + 52 }}
                />
              ) : null}
            </View>
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

const CARD_WIDTH = RIPPLE_CARD_WIDTH;

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
    textAlign: "left",
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
    borderRadius: 999,
    marginTop: 8,
  },
  emptyCtaInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
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
    borderRadius: 999,
    marginTop: 4,
  },
  emptyStateBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  emptyStateBtnGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 28,
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
  candidateLoadingPane: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  micBadgeOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
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
  photoCountryBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  photoCountryBadgeText: {
    fontSize: 16,
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
  fullscreenImageWrap: {
    width: "100%",
    height: "100%",
    position: "relative",
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
  sharedTagsValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#001018",
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
