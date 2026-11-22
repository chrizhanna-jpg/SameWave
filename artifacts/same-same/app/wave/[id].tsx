import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { RippleRings } from "@/components/RippleRings";
import { Scrim } from "@/components/Scrim";
import { Txt } from "@/components/Txt";
import { WaveJoin } from "@/components/WaveJoin";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { WaveSimilarityLine } from "@/components/WaveSimilarityLine";
import type { WaveDetail } from "@/backend/types";
import { describeGap, matchBonuses } from "@/core/bonuses";
import { clipUrlFor, vibeFor } from "@/core/vibes";
import { flagFor, nameFor } from "@/data/countries";
import { NATIVE_DRIVER, useReducedMotion } from "@/device/motion";
import { playClip, playEffect, playWaveSwoosh, stopClip, stopWaveSwoosh } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { colors, motion, space } from "@/theme";

type Phase = "pulse" | "build" | "splash" | "reveal" | "done";

/** Matches the baked swoosh length (~2.2s) plus a short breath before photos. */
const PULSE_MS = 2300;
const PULSE_RINGS = 340;

/**
 * The Wave ceremony, photography first.
 *
 * The two photographs fill the whole screen, stacked edge to edge, with a
 * soft wave-shaped join between them. Labels and controls sit on small local
 * scrims and hide after a moment; a swipe up lifts the story beneath.
 */
export default function WaveScreen() {
  const router = useRouter();
  const { id, reveal } = useLocalSearchParams<{ id: string; reveal?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { waves, ripples, markWaveSeen, markWaveRevealed, shouldRevealWave, reportWave, backend } =
    useAppState();
  const isSampleWave = (waveId: string) => {
    if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isSampleWaveId } = require("../../assets/test-photos/sampleIds") as {
      isSampleWaveId: (value: string) => boolean;
    };
    return isSampleWaveId(waveId);
  };

  const wave = useMemo(() => {
    const live = waves.find((w) => w.id === id) ?? null;
    if (live) return live;
    // Dev/preview sample fixtures — only resolve when the build flag is on.
    if (typeof id === "string" && isSampleWave(id)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadSampleWaves } = require("@/core/testPhotos") as {
        loadSampleWaves: () => typeof waves;
      };
      return loadSampleWaves().find((w) => w.id === id) ?? null;
    }
    return null;
  }, [waves, id]);
  const reduced = useReducedMotion();
  // Persist across push-tap + auto-reveal so the ceremony never double-plays.
  const wantsPulse = reveal === "1" && Boolean(id) && shouldRevealWave(id ?? "");

  const [phase, setPhase] = useState<Phase>(wantsPulse ? "pulse" : "build");
  const [details, setDetails] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [detail, setDetail] = useState<WaveDetail | null>(null);
  const [playing, setPlaying] = useState<"mine" | "theirs" | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const splash = useRef(new Animated.Value(0)).current;
  const sharpen = useRef(new Animated.Value(0)).current;
  const headline = useRef(new Animated.Value(0)).current;
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const panel = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef(false);
  const ceremonyFor = useRef<string | null>(null);

  const bonuses = useMemo(
    () =>
      wave
        ? matchBonuses(
            { takenAt: wave.mine.takenAt, countryCode: wave.mine.countryCode },
            { takenAt: wave.theirs.takenAt, countryCode: wave.theirs.countryCode },
          )
        : null,
    [wave],
  );

  const mineRipple = useMemo(
    () => (wave ? ripples.find((r) => r.photoId === wave.mine.photoId) ?? null : null),
    [wave, ripples],
  );

  const sampleMeta = useMemo(() => {
    if (!wave || process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TEST_PHOTO_META } = require("../../assets/test-photos/fixtures") as {
      TEST_PHOTO_META: readonly { id: string; theme: string; emotion: string }[];
    };
    return {
      mine: TEST_PHOTO_META.find((m) => m.id === wave.mine.photoId) ?? null,
      theirs: TEST_PHOTO_META.find((m) => m.id === wave.theirs.photoId) ?? null,
    };
  }, [wave]);

  const showChrome = () => {
    setChrome(true);
    Animated.timing(chromeOpacity, {
      toValue: 1,
      duration: motion.quick,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => {
      Animated.timing(chromeOpacity, {
        toValue: 0,
        duration: motion.slow,
        useNativeDriver: NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) setChrome(false);
      });
    }, motion.chromeHide);
  };

  const finish = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    fade.setValue(1);
    splash.setValue(0);
    sharpen.setValue(1);
    headline.setValue(1);
    setPhase("done");
    showChrome();
  };

  useEffect(() => {
    if (!wave || seen.current) return;
    seen.current = true;
    if (isSampleWave(wave.id)) return;
    markWaveSeen(wave.id);
    // Browsing from the map without a reveal still counts as revealed so
    // foreground auto-reveal / a later push-tap will not surprise-replay.
    if (reveal !== "1") markWaveRevealed(wave.id);
  }, [wave, markWaveSeen, markWaveRevealed, reveal]);

  useEffect(() => {
    if (!wave || isSampleWave(wave.id)) return;
    let cancelled = false;
    backend
      .getWaveDetail(wave)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [wave, backend]);

  // Circles + ocean swoosh before the photo ceremony (push / first arrival only).
  useEffect(() => {
    if (!wave || phase !== "pulse") return;
    markWaveRevealed(wave.id);
    if (reduced) {
      setPhase("build");
      return;
    }
    void playWaveSwoosh();
    const done = setTimeout(() => setPhase("build"), PULSE_MS);
    return () => {
      clearTimeout(done);
      stopWaveSwoosh();
    };
  }, [wave, phase, reduced, markWaveRevealed]);

  const ceremonyReady = phase !== "pulse";

  useEffect(() => {
    if (!wave || !ceremonyReady) return;
    if (ceremonyFor.current === wave.id) return;
    ceremonyFor.current = wave.id;
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: reduced ? motion.reducedFade : motion.fade,
      useNativeDriver: NATIVE_DRIVER,
    }).start();

    if (reduced) {
      finish();
      return;
    }

    const splashAt = setTimeout(() => {
      setPhase("splash");
      void playEffect("chime");
      splash.setValue(0);
      Animated.sequence([
        Animated.timing(splash, {
          toValue: 1,
          duration: motion.waveSplash * 0.45,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(splash, {
          toValue: 0,
          duration: motion.waveSplash * 0.55,
          easing: Easing.in(Easing.quad),
          useNativeDriver: NATIVE_DRIVER,
        }),
      ]).start();
    }, Math.min(motion.waveBuildUp, 1600));

    const revealAt = setTimeout(() => {
      setPhase("reveal");
      Animated.timing(sharpen, {
        toValue: 1,
        duration: motion.waveSharpen,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      }).start();
    }, Math.min(motion.waveBuildUp, 1600) + motion.waveSplash);

    const headlineAt = setTimeout(() => {
      setPhase("done");
      Animated.timing(headline, {
        toValue: 1,
        duration: motion.fade,
        useNativeDriver: NATIVE_DRIVER,
      }).start();
      showChrome();
    }, Math.min(motion.waveBuildUp, 1600) + motion.waveSplash + motion.waveSharpen + motion.waveHeadlineDelay);

    timers.current = [splashAt, revealAt, headlineAt];
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
      stopClip();
    };
    // Ceremony runs once for this Wave after any pulse phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave?.id, ceremonyReady, reduced]);

  useEffect(() => {
    Animated.timing(panel, {
      toValue: details ? 1 : 0,
      duration: motion.standard,
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [details, panel]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -40) setDetails(true);
        else if (g.dy > 40) setDetails(false);
      },
    }),
  ).current;

  if (!wave) {
    return (
      <View style={[styles.root, styles.missing]}>
        <Txt variant="heading" center>
          This Wave isn't here
        </Txt>
        <Button kind="soft" label="Back" onPress={() => router.back()} style={styles.back} />
      </View>
    );
  }

  if (phase === "pulse") {
    return (
      <View style={[styles.root, styles.pulse]} accessibilityLabel="Wave arriving">
        <View style={styles.pulseStage}>
          <RippleRings size={PULSE_RINGS} rings={4} color={colors.waterMid} />
        </View>
      </View>
    );
  }

  const blur = phase === "build" || phase === "splash" ? 16 : 0;
  const mineClip =
    detail?.mine.recordingUri ?? clipUrlFor(detail?.mine.vibe ?? null, wave.mine.photoId);
  const theirsClip =
    detail?.theirs.recordingUri ?? clipUrlFor(detail?.theirs.vibe ?? null, wave.theirs.photoId);

  const playSide = (side: "mine" | "theirs", uri: string | null) => {
    if (!uri) return;
    if (playing === side) {
      stopClip();
      setPlaying(null);
      return;
    }
    setPlaying(side);
    void playClip(uri, () => setPlaying(null));
  };

  const onReport = async () => {
    if (reporting || reportDone) return;
    setReporting(true);
    try {
      await reportWave(wave, "inappropriate");
      setReportDone(true);
      stopClip();
      router.back();
    } catch {
      setReporting(false);
    }
  };

  const onTapPhotos = () => {
    if (phase !== "done") {
      finish();
      return;
    }
    if (!chrome) showChrome();
    else setDetails((d) => !d);
  };

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <Animated.View style={[styles.fill, { opacity: fade }]}>
        <Pressable style={styles.fill} onPress={onTapPhotos}>
          <WaveJoin
            width={width}
            height={height}
            blurRadius={blur}
            top={{
              uri: wave.mine.uri,
              ownPhotoId: wave.mine.photoId,
              accessibilityLabel: "Your photo",
            }}
            bottom={{
              uri: wave.theirs.uri,
              accessibilityLabel: "Their photo",
            }}
          />
        </Pressable>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.splash,
            {
              opacity: splash,
              transform: [
                {
                  scale: splash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1.04],
                  }),
                },
              ],
            },
          ]}
        >
          <Scrim>
            <Txt variant="hero" tone="white" center overPhoto>
              Wave
            </Txt>
          </Scrim>
        </Animated.View>

        <Animated.View
          pointerEvents={chrome && !details ? "box-none" : "none"}
          style={[
            styles.chrome,
            {
              paddingTop: insets.top + space.sm,
              paddingBottom: insets.bottom + space.lg,
              opacity: chromeOpacity,
            },
          ]}
        >
          <View style={styles.topRow}>
            <Header
              icon="close"
              onPress={() => {
                stopClip();
                router.back();
              }}
            />
          </View>

          <Animated.View style={{ opacity: headline }}>
            <WaveSimilarityLine headline={bonuses?.headline} surface="photo" />
            <Scrim kind="light" style={styles.hint}>
              <View style={styles.up}>
                <Icon name="chevron" size={16} color={colors.textSecondary} />
              </View>
              <Txt variant="quiet" tone="primary" center>
                Discover
              </Txt>
            </Scrim>
          </Animated.View>
        </Animated.View>

        <Animated.View
          pointerEvents={details ? "auto" : "none"}
          style={[
            styles.panel,
            {
              paddingBottom: insets.bottom + space.lg,
              opacity: panel,
              transform: [
                {
                  translateY: panel.interpolate({
                    inputRange: [0, 1],
                    outputRange: [48, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Frost kind="card" style={styles.panelFrost} contentStyle={styles.panelInner}>
            <Pressable onPress={() => setDetails(false)}>
              <View style={styles.panelHandle} accessibilityLabel="Hide details" />
              <WaveSimilarityLine
                headline={bonuses?.headline}
                surface="sheet"
                style={styles.sheetHeadline}
              />
              <Side
                label="You"
                country={wave.mine.countryCode}
                emotion={
                  mineRipple?.emotion ??
                  detail?.mine.emotion ??
                  sampleMeta?.mine?.emotion ??
                  null
                }
                topic={
                  mineRipple?.topic ??
                  mineRipple?.theme ??
                  detail?.mine.topic ??
                  sampleMeta?.mine?.theme ??
                  null
                }
                vibe={detail?.mine.vibe ?? null}
                clip={mineClip}
                playing={playing === "mine"}
                onPlay={() => playSide("mine", mineClip)}
              />
              <Side
                label="Them"
                country={wave.theirs.countryCode}
                emotion={detail?.theirs.emotion ?? sampleMeta?.theirs?.emotion ?? null}
                topic={detail?.theirs.topic ?? sampleMeta?.theirs?.theme ?? null}
                vibe={detail?.theirs.vibe ?? null}
                clip={theirsClip}
                playing={playing === "theirs"}
                onPlay={() => playSide("theirs", theirsClip)}
              />
              {describeGap(wave.mine.takenAt, wave.theirs.takenAt) ? (
                <Txt tone="secondary" center style={styles.gap}>
                  {describeGap(wave.mine.takenAt, wave.theirs.takenAt)}
                </Txt>
              ) : null}
              <Button
                kind="quiet"
                tone="ember"
                label={reportDone ? "Reported" : "Report this photo"}
                onPress={onReport}
                busy={reporting}
                disabled={reportDone}
                style={styles.report}
              />
            </Pressable>
          </Frost>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function Side({
  label,
  country,
  emotion,
  topic,
  vibe,
  clip,
  playing,
  onPlay,
}: {
  label: string;
  country: string | null;
  emotion: string | null;
  topic: string | null;
  vibe: string | null;
  clip: string | null;
  playing: boolean;
  onPlay: () => void;
}) {
  const place = nameFor(country);
  return (
    <View style={styles.side}>
      <Txt variant="quiet" tone="quiet">
        {label}
      </Txt>
      <Txt>
        {flagFor(country)} {place ?? "Somewhere"}
      </Txt>
      <PhotoMetaChip emotion={emotion} topic={topic} style={styles.sideMeta} />
      {vibe || clip ? (
        <Pressable
          onPress={onPlay}
          disabled={!clip}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Stop" : "Play feeling"}
          style={styles.vibe}
        >
          {clip ? <Icon name={playing ? "stop" : "play"} size={18} /> : null}
          <Txt tone="secondary">{vibeFor(vibe)?.label ?? "Sound"}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  pulse: { alignItems: "center", justifyContent: "center" },
  pulseStage: {
    width: PULSE_RINGS,
    height: PULSE_RINGS,
    alignItems: "center",
    justifyContent: "center",
  },
  missing: { alignItems: "center", justifyContent: "center", padding: space.xl },
  splash: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  chrome: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
  },
  topRow: { marginHorizontal: -space.sm },
  sheetHeadline: { marginTop: space.xs, marginBottom: space.md },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    alignSelf: "center",
  },
  up: { transform: [{ rotate: "-90deg" }] },
  panel: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: 0,
  },
  panelFrost: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  panelInner: { paddingHorizontal: space.lg, paddingTop: space.md },
  panelHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: space.lg,
  },
  side: { marginBottom: space.lg, gap: space.xs },
  sideMeta: { alignItems: "flex-start", marginTop: space.xs },
  vibe: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  gap: { marginTop: space.sm },
  report: { marginTop: space.md },
  back: { marginTop: space.xl, alignSelf: "center", minWidth: 180 },
});
