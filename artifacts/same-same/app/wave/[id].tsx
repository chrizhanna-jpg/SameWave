import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Photo } from "@/components/Photo";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import type { WaveDetail } from "@/backend/types";
import { describeGap, matchBonuses } from "@/core/bonuses";
import { clipUrlFor, vibeFor } from "@/core/vibes";
import { flagFor, nameFor } from "@/data/countries";
import { NATIVE_DRIVER, useReducedMotion } from "@/device/motion";
import { playClip, playEffect, stopClip } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { colors, motion, radius, space } from "@/theme";

type Phase = "build" | "splash" | "reveal" | "done";

/**
 * The Wave ceremony: two photos drift together over still water, the word
 * "Wave" appears with a chime, then the photos sharpen and a quiet headline
 * settles in. Details wait behind a tap or a swipe up.
 */
export default function WaveScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { waves, markWaveSeen, reportWave, backend } = useAppState();
  const wave = waves.find((w) => w.id === id) ?? null;
  const reduced = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("build");
  const [details, setDetails] = useState(false);
  const [detail, setDetail] = useState<WaveDetail | null>(null);
  const [playing, setPlaying] = useState<"mine" | "theirs" | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const splash = useRef(new Animated.Value(0)).current;
  const sharpen = useRef(new Animated.Value(0)).current;
  const headline = useRef(new Animated.Value(0)).current;
  const panel = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seen = useRef(false);

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

  const finish = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    fade.setValue(1);
    drift.setValue(1);
    splash.setValue(1);
    sharpen.setValue(1);
    headline.setValue(1);
    setPhase("done");
  };

  useEffect(() => {
    if (!wave || seen.current) return;
    seen.current = true;
    markWaveSeen(wave.id);
  }, [wave, markWaveSeen]);

  useEffect(() => {
    if (!wave) return;
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

  useEffect(() => {
    if (!wave) return;
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

    Animated.timing(drift, {
      toValue: 1,
      duration: motion.waveBuildUp,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();

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
    }, motion.waveBuildUp);

    const revealAt = setTimeout(() => {
      setPhase("reveal");
      Animated.timing(sharpen, {
        toValue: 1,
        duration: motion.waveSharpen,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      }).start();
    }, motion.waveBuildUp + motion.waveSplash);

    const headlineAt = setTimeout(() => {
      setPhase("done");
      Animated.timing(headline, {
        toValue: 1,
        duration: motion.fade,
        useNativeDriver: NATIVE_DRIVER,
      }).start();
    }, motion.waveBuildUp + motion.waveSplash + motion.waveSharpen + motion.waveHeadlineDelay);

    timers.current = [splashAt, revealAt, headlineAt];
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      stopClip();
    };
    // Ceremony runs once for this Wave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave?.id, reduced]);

  useEffect(() => {
    Animated.timing(panel, {
      toValue: details ? 1 : 0,
      duration: motion.fadeQuick,
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
      <Screen center>
        <Txt variant="heading" center>
          This Wave isn't here
        </Txt>
        <Button kind="soft" label="Back" onPress={() => router.back()} style={styles.back} />
      </Screen>
    );
  }

  const blur = phase === "build" || phase === "splash" ? 18 : 0;
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

  return (
    <Screen bare>
      <Animated.View style={[styles.fill, { opacity: fade }]} {...pan.panHandlers}>
        <View style={styles.top}>
          <Header
            icon="close"
            onPress={() => {
              stopClip();
              router.back();
            }}
          />
        </View>

        <Pressable style={styles.stage} onPress={() => (phase === "done" ? setDetails((d) => !d) : finish())}>
          <View style={styles.pair}>
            <Animated.View
              style={[
                styles.photoCard,
                {
                  transform: [
                    {
                      translateX: drift.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-36, -8],
                      }),
                    },
                    {
                      rotate: drift.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["-6deg", "-2deg"],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Photo
                uri={wave.mine.uri}
                ownPhotoId={wave.mine.photoId}
                blurRadius={blur}
                style={styles.photo}
                accessibilityLabel="Your photo"
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.photoCard,
                styles.photoFront,
                {
                  transform: [
                    {
                      translateX: drift.interpolate({
                        inputRange: [0, 1],
                        outputRange: [36, 8],
                      }),
                    },
                    {
                      rotate: drift.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["6deg", "2deg"],
                      }),
                    },
                  ],
                  opacity: sharpen.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1],
                  }),
                },
              ]}
            >
              <Photo
                uri={wave.theirs.uri}
                blurRadius={blur}
                style={styles.photo}
                accessibilityLabel="Their photo"
              />
            </Animated.View>
          </View>

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
                      outputRange: [0.85, 1.05],
                    }),
                  },
                ],
              },
            ]}
          >
            <Txt variant="hero" tone="moon" center>
              Wave
            </Txt>
          </Animated.View>
        </Pressable>

        <Animated.View style={[styles.footer, { opacity: headline }]}>
          {bonuses?.headline ? (
            <Txt variant="heading" center>
              {bonuses.headline}
            </Txt>
          ) : (
            <Txt tone="haze" center>
              Your moments met
            </Txt>
          )}
          <Txt variant="quiet" tone="haze" center style={styles.hint}>
            Tap for details
          </Txt>
        </Animated.View>

        <Animated.View
          pointerEvents={details ? "auto" : "none"}
          style={[
            styles.panel,
            {
              opacity: panel,
              transform: [
                {
                  translateY: panel.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable onPress={() => setDetails(false)} style={styles.panelInner}>
            <View style={styles.panelHandle} />
            <Side
              label="You"
              country={wave.mine.countryCode}
              vibe={detail?.mine.vibe ?? null}
              clip={mineClip}
              playing={playing === "mine"}
              onPlay={() => playSide("mine", mineClip)}
            />
            <Side
              label="Them"
              country={wave.theirs.countryCode}
              vibe={detail?.theirs.vibe ?? null}
              clip={theirsClip}
              playing={playing === "theirs"}
              onPlay={() => playSide("theirs", theirsClip)}
            />
            {describeGap(wave.mine.takenAt, wave.theirs.takenAt) ? (
              <Txt tone="haze" center style={styles.gap}>
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
        </Animated.View>
      </Animated.View>
    </Screen>
  );
}

function Side({
  label,
  country,
  vibe,
  clip,
  playing,
  onPlay,
}: {
  label: string;
  country: string | null;
  vibe: string | null;
  clip: string | null;
  playing: boolean;
  onPlay: () => void;
}) {
  const place = nameFor(country);
  return (
    <View style={styles.side}>
      <Txt variant="quiet" tone="haze">
        {label}
      </Txt>
      <Txt>
        {flagFor(country)} {place ?? "Somewhere"}
      </Txt>
      {vibe || clip ? (
        <Pressable
          onPress={onPlay}
          disabled={!clip}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Stop" : "Play feeling"}
          style={styles.vibe}
        >
          {clip ? <Icon name={playing ? "stop" : "play"} size={18} /> : null}
          <Txt tone="haze">{vibeFor(vibe)?.label ?? "Sound"}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { paddingHorizontal: space.lg, paddingTop: space.lg },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  pair: {
    width: "100%",
    height: 320,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCard: {
    position: "absolute",
    width: 200,
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.pondLift,
  },
  photoFront: { zIndex: 1 },
  photo: { width: "100%", height: "100%" },
  splash: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.xxl, minHeight: 88 },
  hint: { marginTop: space.sm },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.pondLift,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.xxl,
  },
  panelInner: { paddingHorizontal: space.lg, paddingTop: space.md },
  panelHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.pondEdge,
    marginBottom: space.lg,
  },
  side: { marginBottom: space.lg, gap: space.xs },
  vibe: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  gap: { marginTop: space.sm },
  report: { marginTop: space.md },
  back: { marginTop: space.xl, alignSelf: "center", minWidth: 180 },
});
