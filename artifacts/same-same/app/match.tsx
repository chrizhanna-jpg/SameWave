import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FrostIconWell } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { Scrim } from "@/components/Scrim";
import { Txt } from "@/components/Txt";
import { WaveJoin } from "@/components/WaveJoin";
import { WaveMark } from "@/components/WaveMark";
import { errorKind } from "@/backend/types";
import { MATCH } from "@/core/reach";
import { rankMatchCandidates } from "@/core/matchDeck";
import type { Candidate } from "@/core/types";
import { findWaveByPhotos } from "@/core/waves";
import { playEffect } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { colors, layout, space } from "@/theme";

/** Exact empty copy Chris asked for — do not paraphrase. */
const EMPTY_COPY =
  "You're meant to match a photo here, but there are no photos to match right now. Please come back later.";

const ACTION_SIZE = 64;

type LoadState = "loading" | "ready" | "empty" | "error";

/**
 * After Send Ripple: your photo on top, a live candidate below, joined by the
 * Wave seam. X passes (vote different); the wave button offers (vote same).
 * Stock / seed rows are filtered client-side; ranking is emotion + Topic.
 */
export default function MatchScreen() {
  const router = useRouter();
  const { photoId: rawId } = useLocalSearchParams<{ photoId?: string }>();
  const photoId = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";
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

  const ripple = ripples.find((r) => r.photoId === photoId) ?? ripples[0] ?? null;
  const myPhotoId = ripple?.photoId ?? photoId;

  const [deck, setDeck] = useState<Candidate[]>([]);
  const [index, setIndex] = useState(0);
  const [load, setLoad] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seenRef = useRef<string[]>([]);
  const finishedRef = useRef(false);

  const ownIds = ripples.map((r) => r.photoId);
  const excludeBase = [
    ...ownIds,
    ...(ripple?.reach.offeredIds ?? []),
    ...waves.flatMap((w) => [w.mine.photoId, w.theirs.photoId]),
  ];

  const loadDeck = useCallback(async () => {
    if (!myPhotoId || !ripple) {
      setLoad("empty");
      setDeck([]);
      return;
    }
    setLoad("loading");
    setProblem(null);
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
      setDeck(ranked);
      setIndex(0);
      setLoad(ranked.length === 0 ? "empty" : "ready");
    } catch (error) {
      setLoad("error");
      setProblem(
        errorKind(error) === "unreachable"
          ? "Can't reach SameWave right now. Try again in a moment."
          : "Couldn't load photos to match. Please try again.",
      );
    }
  }, [backend, excludeBase, myPhotoId, ownIds, ripple]);

  useEffect(() => {
    void loadDeck();
    // Only re-load when the Ripple id changes — not on every waves sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPhotoId]);

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
    else router.replace("/");
  }, [finishMatchLook, myPhotoId, router]);

  const advance = useCallback(
    (fromId: string) => {
      seenRef.current = [...new Set([...seenRef.current, fromId])];
      recordMatchSeen(myPhotoId, [fromId]);
      const next = index + 1;
      if (next < deck.length) {
        setIndex(next);
        return;
      }
      // End of this page — ask the server for more, excluding what we saw.
      void (async () => {
        setBusy(true);
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
          const more = rankMatchCandidates(pageRows, { emotion, topic }, {
            excludeIds: [...excludeBase, ...seenRef.current],
            ownPhotoIds: ownIds,
          });
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
          setDeck([]);
          setIndex(0);
          setLoad("empty");
        } finally {
          setBusy(false);
        }
      })();
    },
    [backend, deck.length, excludeBase, index, myPhotoId, ownIds, recordMatchSeen, ripple],
  );

  const onPass = async () => {
    const current = deck[index];
    if (!current || busy || load !== "ready") return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    try {
      await backend.pass(current.id);
    } catch {
      // Still move on — local exclude keeps it out of this session.
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
        router.replace("/");
      }
      return;
    }

    setBusy(false);
    advance(current.id);
  };

  const candidate = load === "ready" ? deck[index] ?? null : null;
  const empty = load === "empty" || (load === "ready" && !candidate);
  const showActions = true; // X + wave always visible, even when empty.

  if (!ripple && load !== "loading") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <Txt center tone="secondary" style={styles.missing}>
          That Ripple isn&apos;t on this device any more.
        </Txt>
        <Pressable onPress={() => router.replace("/")} style={styles.missingBtn}>
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
            ? {
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
              // Lower half only: seam mid → above the X / wave action row.
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
              <Txt center style={styles.emptyText}>
                {EMPTY_COPY}
              </Txt>
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
          <FrostIconWell>
            <Icon name="close" color={colors.textPrimary} />
          </FrostIconWell>
        </Pressable>
      </View>

      {showActions ? (
        <View
          style={[styles.actions, { paddingBottom: Math.max(insets.bottom, space.md) + space.sm }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => void onPass()}
            disabled={busy || empty || load !== "ready"}
            accessibilityRole="button"
            accessibilityLabel="Pass"
            accessibilityState={{ disabled: busy || empty || load !== "ready" }}
            style={({ pressed }) => [
              styles.actionHit,
              (busy || empty || load !== "ready") && styles.actionDim,
              pressed && !empty && load === "ready" && styles.actionPressed,
            ]}
          >
            <FrostIconWell style={styles.actionWell}>
              <Icon name="close" size={28} color={colors.textPrimary} />
            </FrostIconWell>
          </Pressable>

          <Pressable
            onPress={() => void onMatch()}
            disabled={busy || empty || load !== "ready"}
            accessibilityRole="button"
            accessibilityLabel="Match"
            accessibilityHint="Sends a match on this photo. When they match back, it becomes a Wave."
            accessibilityState={{ disabled: busy || empty || load !== "ready" }}
            style={({ pressed }) => [
              styles.actionHit,
              (busy || empty || load !== "ready") && styles.actionDim,
              pressed && !empty && load === "ready" && styles.actionPressed,
            ]}
          >
            {/* Frosted well (not blue) so the logo’s coloured waves stay legible. */}
            <FrostIconWell style={styles.actionWell}>
              <WaveMark width={44} />
            </FrostIconWell>
          </Pressable>
        </View>
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
  actionDim: { opacity: 0.45 },
  actionPressed: { opacity: 0.85 },
  missing: { marginHorizontal: space.lg, marginTop: space.xxl },
  missingBtn: { alignSelf: "center", marginTop: space.lg, padding: space.md },
});
