import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { FrostIconWell } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { RippleMark } from "@/components/RippleMark";
import { Scrim } from "@/components/Scrim";
import { Txt } from "@/components/Txt";
import { WaveJoin } from "@/components/WaveJoin";
import { WaveMark } from "@/components/WaveMark";
import { errorKind } from "@/backend/types";
import { parseMatchStage } from "@/core/matchAdvance";
import { MATCH } from "@/core/reach";
import { rankMatchCandidates } from "@/core/matchDeck";
import {
  peekSamplePhotosToggle,
  readSamplePhotosToggle,
  subscribeSamplePhotosToggle,
  testPhotosBuildEnabled,
  withOptionalTestPhotos,
} from "@/core/testPhotos";
import type { Candidate } from "@/core/types";
import { findWaveByPhotos } from "@/core/waves";
import { playEffect } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { colors, layout, motion, space } from "@/theme";

/** Exact empty copy Chris asked for — do not paraphrase. */
const EMPTY_COPY =
  "You're meant to match a photo here, but there are no photos to match right now. Please come back later.";

const ACTION_SIZE = 64;

type LoadState = "loading" | "ready" | "empty" | "error";

/**
 * After Send Ripple: your photo on top, a live candidate below, joined by the
 * Wave seam. Full-bleed overlay: X + RippleMark (ripple stage) or X + WaveMark
 * (wave stage). Any action tap advances the bottom photo.
 */
export default function MatchScreen() {
  const router = useRouter();
  const { photoId: rawId, stage: rawStage } = useLocalSearchParams<{
    photoId?: string;
    stage?: string;
  }>();
  const photoId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";
  const stage = parseMatchStage(rawStage);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    ripples,
    waves,
    backend,
    syncNow,
    recordMatchSeen,
    finishMatchLook,
  } = useAppState();
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
      if (!testPhotosBuildEnabled()) return;
      void readSamplePhotosToggle().then((on) => {
        setUseSamples(on);
        setSamplesReady(true);
      });
    }, []),
  );

  const ripple = ripples.find((r) => r.photoId === photoId) ?? ripples[0] ?? null;
  const myPhotoId = ripple?.photoId ?? photoId;

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
      useNativeDriver: true,
    }).start();
  }, [bottomPulse]);

  const ownIds = ripples.map((r) => r.photoId);
  const excludeBase = [
    ...ownIds,
    ...(ripple?.reach.offeredIds ?? []),
    ...waves.flatMap((w) => [w.mine.photoId, w.theirs.photoId]),
  ];

  const loadDeck = useCallback(async () => {
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
      const emotion = ripple.emotion ?? ripple.vibe ?? null;
      const topic = ripple.topic ?? ripple.theme ?? null;
      const looked: string[] = [];
      let ranked: Candidate[] = [];
      for (let page = 0; page < MATCH.maxPages && ranked.length === 0; page++) {
        const pageRows = await backend.findCandidates({
          theme: topic ?? ripple.theme,
          tags: ripple.tags,
          subjects: ripple.subjects,
          emotion,
          limit: MATCH.pageSize,
          excludeIds: [...excludeBase, ...seenRef.current, ...looked].slice(-200),
        });
        ranked = rankMatchCandidates(pageRows, { emotion, topic }, {
          excludeIds: [...excludeBase, ...seenRef.current],
          ownPhotoIds: ownIds,
        });
        if (pageRows.length < MATCH.pageSize) break;
        looked.push(...pageRows.map((c) => c.id));
      }
      if (gen !== loadGen.current) return;
      const withSamples = withOptionalTestPhotos(ranked, {
        useSamplePhotos: samplesOn,
        excludeIds: [...excludeBase, ...seenRef.current],
      });
      setDeck(withSamples);
      setIndex(0);
      setLoad(withSamples.length === 0 ? "empty" : "ready");
    } catch (error) {
      if (gen !== loadGen.current) return;
      // Even when the API fails, sample fixtures can still fill the deck.
      const samplesOnly = withOptionalTestPhotos([], {
        useSamplePhotos: samplesOn,
        excludeIds: [...excludeBase, ...seenRef.current],
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
  }, [backend, excludeBase, myPhotoId, ownIds, ripple, samplesReady, useSamples]);

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
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }, [finishMatchLook, myPhotoId, router]);

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
          const emotion = ripple?.emotion ?? ripple?.vibe ?? null;
          const topic = ripple?.topic ?? ripple?.theme ?? null;
          const pageRows = await backend.findCandidates({
            theme: topic ?? ripple?.theme ?? "",
            tags: ripple?.tags ?? [],
            subjects: ripple?.subjects ?? [],
            emotion,
            limit: MATCH.pageSize,
            excludeIds: [...excludeBase, ...seenRef.current].slice(-200),
          });
          const ranked = rankMatchCandidates(pageRows, { emotion, topic }, {
            excludeIds: [...excludeBase, ...seenRef.current],
            ownPhotoIds: ownIds,
          });
          const more = withOptionalTestPhotos(ranked, {
            useSamplePhotos: samplesOn,
            excludeIds: [...excludeBase, ...seenRef.current],
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
          const samplesOnly = withOptionalTestPhotos([], {
            useSamplePhotos: samplesOn,
            excludeIds: [...excludeBase, ...seenRef.current],
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
    void playEffect("drop");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    // Sample fixtures: advance only (no server offer).
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
  const sampleCaption =
    candidate && isSample(candidate.id)
      ? [
          candidate.countryCode ? `Sample · ${candidate.countryCode}` : "Sample",
          candidate.takenAt
            ? new Date(candidate.takenAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  if (!ripple && load !== "loading") {
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

  return (
    <View style={styles.root}>
      <WaveJoin
        width={width}
        height={height}
        top={{
          uri: ripple?.localUri ?? null,
          ownPhotoId: myPhotoId || undefined,
          accessibilityLabel: "Your photo",
        }}
        bottom={
          candidate
            ? candidate.uri && candidate.id.startsWith("test_sample_")
              ? {
                  uri: candidate.uri,
                  accessibilityLabel: "Sample photo",
                }
              : {
                  // Relative /api/… URIs need auth — Photo fetches by id.
                  uri: null,
                  ownPhotoId: candidate.id,
                  accessibilityLabel: "Their photo",
                }
            : {
                uri: null,
                accessibilityLabel: "No photo to match",
              }
        }
      />

      {empty || load === "loading" || load === "error" ? (
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
            {load === "loading" ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : load === "error" && problem ? (
              <Txt center style={styles.emptyText}>
                {problem}
              </Txt>
            ) : (
              <>
                <Txt center style={styles.emptyText}>
                  {EMPTY_COPY}
                </Txt>
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

      {sampleCaption && showActions ? (
        <View
          style={[styles.sampleCaption, { bottom: Math.max(insets.bottom, space.md) + ACTION_SIZE + space.lg }]}
          pointerEvents="none"
        >
          <Scrim kind="light">
            <Txt variant="quiet" center>
              {sampleCaption}
            </Txt>
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
          <FrostIconWell>
            <Icon name="close" color={colors.textPrimary} />
          </FrostIconWell>
        </Pressable>
      </View>

      {showActions ? (
        <Animated.View
          style={[
            styles.actions,
            {
              paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
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
            <FrostIconWell style={styles.actionWell}>
              <Icon name="close" size={28} color={colors.textPrimary} />
            </FrostIconWell>
          </Pressable>

          <Pressable
            onPress={() => void onMatch()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={stage === "wave" ? "Wave" : "Ripple"}
            accessibilityHint="Offers a match on this photo. Any tap advances the bottom photo."
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.actionHit, pressed && styles.actionPressed]}
          >
            {/* Frosted well so stage glyphs stay legible on the photo. */}
            <FrostIconWell style={styles.actionWell}>
              {stage === "wave" ? (
                <WaveMark width={44} />
              ) : (
                <RippleMark size={36} color={colors.waterMid} />
              )}
            </FrostIconWell>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
    zIndex: 2,
  },
  emptyScrim: {
    maxWidth: layout.maxContentWidth,
    width: "100%",
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  emptyText: { color: colors.textPrimary },
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
  actionWell: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
  },
  actionPressed: { opacity: 0.85, transform: [{ scale: 0.94 }] },
  emptyDone: { marginTop: space.lg, alignSelf: "stretch" },
  sampleCaption: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    zIndex: 3,
    alignItems: "center",
  },
  missing: { marginHorizontal: space.lg, marginTop: space.xxl },
  missingBtn: { alignSelf: "center", marginTop: space.lg, padding: space.md },
});
