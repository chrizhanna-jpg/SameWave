import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { SoftIconDisc } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { MATCH_RIPPLE_INK, RippleMark } from "@/components/RippleMark";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { Scrim } from "@/components/Scrim";
import { Txt } from "@/components/Txt";
import { WaveJoin } from "@/components/WaveJoin";
import { WaveMark } from "@/components/WaveMark";
import { errorKind } from "@/backend/types";
import { parseMatchStage } from "@/core/matchAdvance";
import { MATCH } from "@/core/reach";
import { rankMatchCandidates } from "@/core/matchDeck";
import {
  findOfferIncludingPreview,
  inboxOfferMyThumbSource,
  inboxOfferTheirThumbSource,
  isPreviewOfferId,
  previewWaveIdForOffer,
} from "@/core/sampleOffers";
import {
  peekSamplePhotosToggle,
  readSamplePhotosToggle,
  subscribeSamplePhotosToggle,
  testPhotosBuildEnabled,
  withOptionalTestPhotos,
} from "@/core/testPhotos";
import type { Candidate } from "@/core/types";
import { findWaveByPhotos } from "@/core/waves";
import { NATIVE_DRIVER } from "@/device/motion";
import { waveLayoutMetrics } from "@/device/waveLayoutMetrics";
import { playRipple, playWave } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { colors, layout, motion, space } from "@/theme";

/** Hide the light Android nav/root band while Match is full-bleed. */
const MATCH_CHROME = "#000000";

/** Exact empty copy Chris asked for — do not paraphrase. */
const EMPTY_COPY =
  "You're meant to match a photo here, but there are no photos to match right now. Please come back later.";

const ACTION_SIZE = 64;
/** Top-left close disc — same SoftIconDisc fill as the bottom actions. */
const CLOSE_SIZE = layout.iconButtonSize;

type LoadState = "loading" | "ready" | "empty" | "error";

/**
 * After uploading a moment: your photo on top, a live candidate below, joined by the
 * Wave seam. Full-bleed overlay: X + RippleMark (ripple stage) or X + WaveMark
 * (wave stage). Any action tap advances the bottom photo.
 *
 * Inbox decision (Ripples received → Match): `offerId` + `stage=wave` + `from=waves`.
 * Offer a Wave / Pass reuse the same SoftIconDisc chrome; no new card buttons.
 */
export default function MatchScreen() {
  const router = useRouter();
  const {
    photoId: rawId,
    stage: rawStage,
    from: rawFrom,
    offerId: rawOfferId,
  } = useLocalSearchParams<{
    photoId?: string;
    stage?: string;
    from?: string;
    offerId?: string;
  }>();
  const photoId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";
  const offerId =
    typeof rawOfferId === "string" ? rawOfferId : Array.isArray(rawOfferId) ? rawOfferId[0] : "";
  const stage = parseMatchStage(rawStage);
  const fromWaves =
    (typeof rawFrom === "string" ? rawFrom : Array.isArray(rawFrom) ? rawFrom[0] : "") ===
    "waves";
  const windowDims = useWindowDimensions();
  // Prefer live layout size so WaveJoin always fills the Match root (no bottom gap).
  // Seed from waveLayoutMetrics so the first paint matches capture crop aspect.
  const metrics = useMemo(
    () => waveLayoutMetrics(),
    [windowDims.width, windowDims.height],
  );
  const [bleedSize, setBleedSize] = useState(metrics);
  useEffect(() => {
    setBleedSize(metrics);
  }, [metrics]);
  const { width, height } = bleedSize;
  const insets = useSafeAreaInsets();
  const {
    ripples,
    waves,
    offers,
    backend,
    syncNow,
    recordMatchSeen,
    finishMatchLook,
    markPostSendRippleOffered,
    respondToOffer,
    countryCode,
  } = useAppState();
  const inboxOffer = useMemo(
    () => (offerId ? findOfferIncludingPreview(offers, offerId) : null),
    [offerId, offers],
  );
  const inboxDecision = Boolean(offerId && inboxOffer);
  // null = still reading toggle; never fetch until known (avoids empty-deck race).
  const [useSamples, setUseSamples] = useState<boolean | null>(() => {
    if (!testPhotosBuildEnabled()) return false;
    return peekSamplePhotosToggle();
  });
  const [samplesReady, setSamplesReady] = useState(
    () => !testPhotosBuildEnabled() || peekSamplePhotosToggle() !== null,
  );

  useEffect(() => {
    if (!testPhotosBuildEnabled()) {
      setUseSamples(false);
      setSamplesReady(true);
      return;
    }
    let cancelled = false;
    void readSamplePhotosToggle().then((on) => {
      if (cancelled) return;
      setUseSamples(on);
      setSamplesReady(true);
    });
    const stop = subscribeSamplePhotosToggle((on) => {
      setUseSamples(on);
      setSamplesReady(true);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Kill the baby-blue SystemUI / nav band under the photos.
      void SystemUI.setBackgroundColorAsync(MATCH_CHROME).catch(() => undefined);
      if (testPhotosBuildEnabled()) {
        void readSamplePhotosToggle().then((on) => {
          setUseSamples(on);
          setSamplesReady(true);
        });
      }
      return () => {
        void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
      };
    }, []),
  );

  const ripple = ripples.find((r) => r.photoId === photoId) ?? ripples[0] ?? null;
  const myPhotoId = inboxOffer?.myPhotoId ?? ripple?.photoId ?? photoId;

  const [deck, setDeck] = useState<Candidate[]>([]);
  const [index, setIndex] = useState(0);
  const [load, setLoad] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seenRef = useRef<string[]>([]);
  const finishedRef = useRef(false);
  const loadGen = useRef(0);
  const bottomPulse = useRef(new Animated.Value(1)).current;

  const pulseBottom = useCallback(() => {
    bottomPulse.setValue(0.92);
    Animated.timing(bottomPulse, {
      toValue: 1,
      duration: motion.fadeQuick,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [bottomPulse]);

  const ownIds = useMemo(() => ripples.map((r) => r.photoId), [ripples]);
  const offeredIds = ripple?.reach.offeredIds;
  const excludeBase = useMemo(
    () => [
      ...ownIds,
      ...(offeredIds ?? []),
      ...waves.flatMap((w) => [w.mine.photoId, w.theirs.photoId]),
    ],
    [ownIds, offeredIds, waves],
  );

  /** Pin their moment as the only candidate when deciding a Ripple received. */
  useEffect(() => {
    if (!inboxOffer) return;
    const theirSource = inboxOfferTheirThumbSource(inboxOffer);
    let theirUri =
      inboxOffer.theirUri ??
      (theirSource && typeof theirSource === "object" && "uri" in theirSource
        ? (theirSource.uri as string)
        : null);
    // Preview web shots: catalog URI can be empty before Metro resolves.
    if (
      !theirUri &&
      isPreviewOfferId(inboxOffer.id) &&
      typeof window !== "undefined"
    ) {
      theirUri = new URL(
        "/assets/assets/test-photos/02-coffee-hands.jpg",
        window.location.origin,
      ).href;
    }
    const pinned: Candidate = {
      id: inboxOffer.theirPhotoId,
      score: 1,
      uri: theirUri ?? "",
      createdAt: inboxOffer.createdAt,
      theme: inboxOffer.theirTopic ?? null,
      emotion: inboxOffer.theirEmotion ?? null,
      wavedAtYou: true,
    };
    setDeck([pinned]);
    setIndex(0);
    setLoad("ready");
  }, [inboxOffer]);

  const loadDeck = useCallback(async () => {
    // Inbox decision uses the pinned offer — skip candidate fetch.
    if (inboxDecision) return;
    if (!samplesReady || useSamples === null) return;
    if (!myPhotoId || !ripple) {
      setLoad("empty");
      setDeck([]);
      return;
    }
    const gen = ++loadGen.current;
    setLoad("loading");
    setProblem(null);
    const samplesOn = useSamples;
    try {
      const emotion = ripple.emotion ?? null;
      const musicGenre = ripple.vibe ?? null;
      const topic = ripple.topic ?? ripple.theme ?? null;
      const looked: string[] = [];
      let ranked: Candidate[] = [];
      for (let page = 0; page < MATCH.maxPages && ranked.length === 0; page++) {
        const pageRows = await backend.findCandidates({
          theme: topic ?? ripple.theme,
          tags: ripple.tags,
          subjects: ripple.subjects,
          emotion,
          musicGenre,
          voterPhotoId: myPhotoId || null,
          limit: MATCH.pageSize,
          excludeIds: [...excludeBase, ...seenRef.current, ...looked].slice(-200),
        });
        ranked = rankMatchCandidates(pageRows, { emotion, topic }, {
          excludeIds: [...excludeBase, ...seenRef.current],
          ownPhotoIds: ownIds,
          countryCode,
        });
        if (pageRows.length < MATCH.pageSize) break;
        looked.push(...pageRows.map((c) => c.id));
      }
      if (gen !== loadGen.current) return;
      const preferTopic = topic ?? ripple.theme ?? null;
      const withSamples = withOptionalTestPhotos(ranked, {
        useSamplePhotos: samplesOn,
        excludeIds: [...excludeBase, ...seenRef.current],
        preferTopic,
      });
      setDeck(withSamples);
      setIndex(0);
      setLoad(withSamples.length === 0 ? "empty" : "ready");
    } catch (error) {
      if (gen !== loadGen.current) return;
      // Even when the API fails, sample fixtures can still fill the deck.
      const preferTopic = ripple.topic ?? ripple.theme ?? null;
      const samplesOnly = withOptionalTestPhotos([], {
        useSamplePhotos: samplesOn,
        excludeIds: [...excludeBase, ...seenRef.current],
        preferTopic,
      });
      if (samplesOnly.length > 0) {
        setDeck(samplesOnly);
        setIndex(0);
        setLoad("ready");
        return;
      }
      setLoad("error");
      setProblem(
        errorKind(error) === "unreachable"
          ? "Can't reach SameWave right now. Try again in a moment."
          : "Couldn't load photos to match. Please try again.",
      );
    }
  }, [backend, countryCode, excludeBase, inboxDecision, myPhotoId, ownIds, ripple, samplesReady, useSamples]);

  useEffect(() => {
    void loadDeck();
  }, [loadDeck]);

  // If the screen unmounts (close, Wave ceremony, or app background kill path),
  // count the first look so background reach can continue later.
  useEffect(() => {
    return () => {
      if (!finishedRef.current && myPhotoId) {
        finishedRef.current = true;
        finishMatchLook(myPhotoId, seenRef.current);
      }
    };
  }, [finishMatchLook, myPhotoId]);

  const close = useCallback(async () => {
    if (!finishedRef.current && myPhotoId) {
      finishedRef.current = true;
      finishMatchLook(myPhotoId, seenRef.current);
    }
    // Inbox tap opens Match with from=waves — SoftIconDisc X returns there.
    if (fromWaves) {
      router.replace("/(tabs)/waves");
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }, [finishMatchLook, myPhotoId, router, fromWaves]);

  const advance = useCallback(
    (fromId: string) => {
      seenRef.current = [...new Set([...seenRef.current, fromId])];
      recordMatchSeen(myPhotoId, [fromId]);
      pulseBottom();
      const next = index + 1;
      if (next < deck.length) {
        setIndex(next);
        return;
      }
      // End of this page — ask the server for more (and keep sample fixtures).
      void (async () => {
        setBusy(true);
        const gen = ++loadGen.current;
        const samplesOn = useSamples === true;
        try {
          const emotion = ripple?.emotion ?? null;
          const musicGenre = ripple?.vibe ?? null;
          const topic = ripple?.topic ?? ripple?.theme ?? null;
          const pageRows = await backend.findCandidates({
            theme: topic ?? ripple?.theme ?? "",
            tags: ripple?.tags ?? [],
            subjects: ripple?.subjects ?? [],
            emotion,
            musicGenre,
            voterPhotoId: myPhotoId || null,
            limit: MATCH.pageSize,
            excludeIds: [...excludeBase, ...seenRef.current].slice(-200),
          });
          const ranked = rankMatchCandidates(pageRows, { emotion, topic }, {
            excludeIds: [...excludeBase, ...seenRef.current],
            ownPhotoIds: ownIds,
            countryCode,
          });
          const preferTopic = topic ?? ripple?.theme ?? null;
          const more = withOptionalTestPhotos(ranked, {
            useSamplePhotos: samplesOn,
            excludeIds: [...excludeBase, ...seenRef.current],
            preferTopic,
          });
          if (gen !== loadGen.current) return;
          if (more.length === 0) {
            setDeck([]);
            setIndex(0);
            setLoad("empty");
          } else {
            setDeck(more);
            setIndex(0);
            setLoad("ready");
          }
        } catch {
          if (gen !== loadGen.current) return;
          const preferTopic = ripple?.topic ?? ripple?.theme ?? null;
          const samplesOnly = withOptionalTestPhotos([], {
            useSamplePhotos: samplesOn,
            excludeIds: [...excludeBase, ...seenRef.current],
            preferTopic,
          });
          if (samplesOnly.length > 0) {
            setDeck(samplesOnly);
            setIndex(0);
            setLoad("ready");
          } else {
            setDeck([]);
            setIndex(0);
            setLoad("empty");
          }
        } finally {
          setBusy(false);
        }
      })();
    },
    [
      backend,
      deck.length,
      excludeBase,
      index,
      myPhotoId,
      ownIds,
      pulseBottom,
      recordMatchSeen,
      ripple,
      useSamples,
    ],
  );

  const isSample = (id: string) => {
    if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isSamplePhotoId } = require("../assets/test-photos/sampleIds") as {
      isSamplePhotoId: (value: string) => boolean;
    };
    return isSamplePhotoId(id);
  };

  const onPass = async () => {
    const current = deck[index];
    if (!current || busy || load !== "ready") return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    // Ripples received: Pass dismisses the pending offer and returns to Waves.
    if (inboxDecision && offerId) {
      try {
        await respondToOffer(offerId, "different");
      } catch {
        setBusy(false);
        setProblem("Couldn't pass on that moment. Please try again.");
        return;
      }
      setBusy(false);
      finishedRef.current = true;
      router.replace("/(tabs)/waves");
      return;
    }

    if (!isSample(current.id)) {
      try {
        await backend.pass(current.id);
      } catch {
        // Still move on — local exclude keeps it out of this session.
      }
    }
    setBusy(false);
    advance(current.id);
  };

  const onMatch = async () => {
    const current = deck[index];
    if (!current || busy || load !== "ready" || !myPhotoId) return;
    setBusy(true);
    // Ripple = offer; Wave = match-back. No drop beep; no arrival chime here.
    if (stage === "wave" || inboxDecision) void playWave();
    else void playRipple();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    // Ripples received: Offer a Wave accepts → mutual Wave → Waves section.
    if (inboxDecision && offerId) {
      try {
        await respondToOffer(offerId, "same");
      } catch (error) {
        setBusy(false);
        setProblem(
          errorKind(error) === "unreachable"
            ? "Can't reach SameWave right now. Try again in a moment."
            : "That match didn't go. Please try again.",
        );
        return;
      }
      finishedRef.current = true;
      finishMatchLook(myPhotoId, seenRef.current);
      let waveId: string | null = isPreviewOfferId(offerId)
        ? previewWaveIdForOffer(offerId)
        : null;
      if (!waveId) {
        let formed = findWaveByPhotos(waves, myPhotoId, current.id);
        try {
          await syncNow({ force: true });
          const fresh = await backend.listWaves();
          formed = findWaveByPhotos(fresh, myPhotoId, current.id) ?? formed;
        } catch {
          // Offer already accepted; Waves tab will catch up on focus sync.
        }
        waveId = formed?.id ?? null;
      }
      setBusy(false);
      if (waveId) {
        router.replace({ pathname: "/wave/[id]", params: { id: waveId } });
      } else {
        router.replace("/(tabs)/waves");
      }
      return;
    }

    // Sample fixtures in the normal Match deck: advance only (no server offer).
    if (isSample(current.id)) {
      setBusy(false);
      advance(current.id);
      return;
    }

    let result: "waiting" | "wave" | "skipped" = "waiting";
    try {
      result = await backend.offer(myPhotoId, current.id);
    } catch (error) {
      setBusy(false);
      setProblem(
        errorKind(error) === "unreachable"
          ? "Can't reach SameWave right now. Try again in a moment."
          : "That match didn't go. Please try again.",
      );
      return;
    }
    // Offer = send a Ripple — Home may show "Your Ripple is out there".
    markPostSendRippleOffered();
    seenRef.current = [...new Set([...seenRef.current, current.id])];
    recordMatchSeen(myPhotoId, [current.id]);

    if (result === "wave") {
      finishedRef.current = true;
      finishMatchLook(myPhotoId, seenRef.current);
      let formed = findWaveByPhotos(waves, myPhotoId, current.id);
      try {
        await syncNow({ force: true });
        const fresh = await backend.listWaves();
        formed = findWaveByPhotos(fresh, myPhotoId, current.id) ?? formed;
      } catch {
        // Waves list may still catch up via WaveArrivalHost on home.
      }
      setBusy(false);
      if (formed) {
        router.replace({ pathname: "/wave/[id]", params: { id: formed.id } });
      } else {
        router.replace("/home");
      }
      return;
    }

    setBusy(false);
    advance(current.id);
  };

  const candidate = load === "ready" ? deck[index] ?? null : null;
  const empty = load === "empty" || (load === "ready" && !candidate);
  // Hide match/skip when there's nothing to act on — dead buttons confuse people.
  const showActions = load === "ready" && !empty;
  // Inbox decision can render from the offer alone (preview has no local Ripple ledger).
  const myThumb = inboxOffer ? inboxOfferMyThumbSource(inboxOffer) : null;
  const myUri =
    inboxOffer?.myUri ??
    (myThumb && typeof myThumb === "object" && "uri" in myThumb ? (myThumb.uri as string) : null) ??
    ripple?.localUri ??
    null;
  if (!ripple && !inboxDecision && load !== "loading") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <Txt center tone="secondary" style={styles.missing}>
          That Ripple isn&apos;t on this device any more.
        </Txt>
        <Pressable onPress={() => router.replace("/home")} style={styles.missingBtn}>
          <Txt tone="moon">Back home</Txt>
        </Pressable>
      </View>
    );
  }

  // Full-bleed pair: photos fill the root edge-to-edge; SoftIconDisc chrome floats over.
  const actionPadBottom = Math.max(insets.bottom, space.md) + space.sm;

  return (
    <View
      style={styles.root}
      onLayout={(event) => {
        const { width: w, height: h } = event.nativeEvent.layout;
        if (w < 1 || h < 1) return;
        setBleedSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }}
    >
      <StatusBar style="light" />
      <View style={styles.bleed} pointerEvents="none">
        <WaveJoin
          width={width}
          height={height}
          top={{
            uri: myUri,
            ownPhotoId: myUri ? undefined : myPhotoId || undefined,
            quiet: true,
            accessibilityLabel: "Your photo",
          }}
          bottom={
            candidate
              ? candidate.uri && (isSample(candidate.id) || inboxDecision)
                ? {
                    uri: candidate.uri,
                    blurIn: true,
                    quiet: true,
                    accessibilityLabel: inboxDecision ? "Their moment" : "Sample photo",
                  }
                : {
                    // Relative /api/… URIs need auth — Photo fetches by id.
                    uri: null,
                    ownPhotoId: candidate.id,
                    blurIn: true,
                    quiet: true,
                    accessibilityLabel: "Their photo",
                  }
              : {
                  uri: null,
                  quiet: true,
                  accessibilityLabel: "No photo to match",
                }
          }
        />
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(25, 34, 36, 0)", "rgba(25, 34, 36, 0.32)"]}
        locations={[0.35, 1]}
        style={styles.bottomWash}
      />

      {empty || load === "error" ? (
        <View
          style={[
            styles.emptyWrap,
            {
              // Lower half only: seam mid → above the action / Done row.
              top: height / 2,
              bottom:
                ACTION_SIZE + Math.max(insets.bottom, space.md) + space.sm + space.md,
            },
          ]}
          pointerEvents="box-none"
        >
          <Scrim kind="light" style={styles.emptyScrim}>
            {load === "error" && problem ? (
              <Txt center style={styles.emptyText}>
                {problem}
              </Txt>
            ) : (
              <>
                <Txt center style={styles.emptyText}>
                  {EMPTY_COPY}
                </Txt>
                {empty && testPhotosBuildEnabled() && useSamples === false ? (
                  <Txt center variant="quiet" tone="secondary" style={styles.emptyHint}>
                    Turn on Sample data in Account to test
                  </Txt>
                ) : null}
                {empty ? (
                  <Button
                    kind="soft"
                    label="Back home"
                    onPress={() => void close()}
                    style={styles.emptyDone}
                  />
                ) : null}
              </>
            )}
          </Scrim>
        </View>
      ) : null}

      {problem && load === "ready" ? (
        <View style={[styles.toast, { top: insets.top + space.xl }]} pointerEvents="none">
          <Scrim kind="light">
            <Txt center variant="quiet">
              {problem}
            </Txt>
          </Scrim>
        </View>
      ) : null}

      <View
        style={[styles.chrome, { paddingTop: insets.top + space.sm }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => void close()}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <SoftIconDisc size={CLOSE_SIZE}>
            <Icon name="close" color={colors.slate} />
          </SoftIconDisc>
        </Pressable>
      </View>

      {showActions ? (
        <Animated.View
          style={[
            styles.actions,
            {
              paddingBottom: actionPadBottom,
              transform: [{ scale: bottomPulse }],
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => void onPass()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Pass"
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.actionHit, pressed && styles.actionPressed]}
          >
            <SoftIconDisc size={ACTION_SIZE}>
              <Icon name="close" size={28} color={colors.slate} />
            </SoftIconDisc>
          </Pressable>

          {candidate ? (
            <PhotoMetaChip
              compact
              emotion={candidate.emotion}
              topic={candidate.theme}
            />
          ) : (
            <View style={styles.metaSpacer} />
          )}

          <Pressable
            onPress={() => void onMatch()}
            disabled={busy}
            accessibilityRole="button"
            // Keep labels distinct from tab bar "Ripple" / "Waves" so a11y
            // and automation never activate the wrong control.
            accessibilityLabel={
              stage === "wave" || inboxDecision ? "Offer a Wave" : "Offer a Ripple"
            }
            accessibilityHint={
              inboxDecision
                ? "Matches back to form a Wave"
                : "Offers a match on this photo. Any tap advances the bottom photo."
            }
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.actionHit, pressed && styles.actionPressed]}
          >
            {/* Soft circular disc only — no Frost / elevation hexagon behind. */}
            <SoftIconDisc size={ACTION_SIZE}>
              {stage === "wave" || inboxDecision ? (
                <WaveMark width={44} />
              ) : (
                <RippleMark size={48} color={MATCH_RIPPLE_INK} />
              )}
            </SoftIconDisc>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Black fill so any residual system-bar strip isn't baby-blue / white.
  root: { flex: 1, backgroundColor: MATCH_CHROME },
  bleed: {
    ...StyleSheet.absoluteFill,
  },
  bottomWash: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
    zIndex: 2,
  },
  chrome: {
    position: "absolute",
    left: space.md,
    right: space.md,
    top: 0,
    zIndex: 4,
  },
  emptyWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.lg,
    zIndex: 3,
  },
  emptyScrim: {
    maxWidth: layout.maxContentWidth,
    width: "100%",
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  emptyText: { color: colors.textPrimary },
  emptyHint: { marginTop: space.md },
  toast: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    zIndex: 5,
    alignItems: "center",
  },
  actions: {
    position: "absolute",
    left: space.xl,
    right: space.xl,
    bottom: 0,
    zIndex: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionHit: { borderRadius: ACTION_SIZE / 2 },
  actionPressed: { opacity: 0.85, transform: [{ scale: 0.94 }] },
  emptyDone: { marginTop: space.lg, alignSelf: "stretch" },
  metaSpacer: { flex: 1, minWidth: 0 },
  missing: { marginHorizontal: space.lg, marginTop: space.xxl },
  missingBtn: { alignSelf: "center", marginTop: space.lg, padding: space.md },
});
