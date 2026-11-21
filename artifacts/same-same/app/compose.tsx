import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Photo } from "@/components/Photo";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { SoundRecorder, type Recording } from "@/components/SoundRecorder";
import { Txt } from "@/components/Txt";
import { errorKind } from "@/backend/types";
import { PICKER_VIBE_IDS } from "@/data/vibes";
import { vibeFor } from "@/core/vibes";
import { playEffect } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { getDraftPhoto, setDraftPhoto } from "@/state/draft";
import { colors, motion, radius, space } from "@/theme";

/**
 * The send screen: the photo, an optional feeling, an optional sound, and
 * one gold button. Tapping it starts the rings from the finger and plays the
 * water drop; the person stays here until the Ripple has reached the server.
 */
export default function ComposeScreen() {
  const router = useRouter();
  const { sendRipple } = useAppState();
  const photo = getDraftPhoto();

  const [vibe, setVibe] = useState<string | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  const box = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!photo) router.replace("/");
  }, [photo, router]);

  if (!photo) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    box.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  };

  const send = async (event: GestureResponderEvent) => {
    if (sending || sent) return;
    const { locationX, locationY } = event.nativeEvent;
    setTap({
      x: Number.isFinite(locationX) ? locationX : box.current.width / 2,
      y: Number.isFinite(locationY) ? locationY : box.current.height / 2,
    });
    setSending(true);
    setProblem(null);
    void playEffect("drop");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    try {
      await sendRipple({ photo, vibe, recording });
      setSent(true);
      setDraftPhoto(null);
      // Brief pause so the rings can finish their one-off spread, then home.
      setTimeout(() => router.replace("/"), motion.rippleSend);
    } catch (error) {
      setSending(false);
      setTap(null);
      const kind = errorKind(error);
      setProblem(
        kind === "unreachable"
          ? "Can't reach SameWave right now. Your photo is still here — try again in a moment."
          : kind === "signed-out"
            ? "Your session ended. Sign in again, then send."
            : "That Ripple didn't go. Please try again.",
      );
    }
  };

  return (
    <Screen scroll>
      <Header icon="close" onPress={() => { setDraftPhoto(null); router.replace("/"); }} />

      <View style={styles.photoWrap}>
        <Photo uri={photo.uri} style={styles.photo} accessibilityLabel="Today's photo" />
      </View>

      <Txt tone="secondary" style={styles.section}>
        A feeling (optional)
      </Txt>
      <View style={styles.vibes}>
        {PICKER_VIBE_IDS.map((id) => {
          const label = vibeFor(id)?.label ?? id;
          const on = vibe === id;
          return (
            <Pressable
              key={id}
              onPress={() => setVibe(on ? null : id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Txt variant="quiet" tone={on ? "mist" : "haze"}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <Txt tone="secondary" style={styles.section}>
        A sound (optional)
      </Txt>
      <SoundRecorder value={recording} onChange={setRecording} />

      <View style={styles.send} onLayout={onLayout}>
        <Button
          label={sending || sent ? "Sending…" : "Send Ripple"}
          onPress={send}
          busy={sending && !sent}
          disabled={sending || sent}
        />
        {tap ? (
          <View
            pointerEvents="none"
            style={[
              styles.rings,
              {
                left: tap.x - 140,
                top: tap.y - 140,
              },
            ]}
          >
            <RippleRings size={280} loop={false} duration={motion.rippleSend} rings={4} />
          </View>
        ) : null}
      </View>

      {problem ? (
        <Txt variant="quiet" tone="ember" center style={styles.problem}>
          {problem}
        </Txt>
      ) : (
        <Txt variant="quiet" tone="secondary" center style={styles.problem}>
          Matching is on the photo only. The feeling and sound travel with it.
        </Txt>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoWrap: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 320,
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  photo: { width: "100%", height: "100%" },
  section: { marginTop: space.xl, marginBottom: space.sm },
  vibes: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.line },
  send: { marginTop: space.xl, position: "relative", overflow: "visible" },
  rings: { position: "absolute", width: 280, height: 280 },
  problem: { marginTop: space.md, marginBottom: space.lg },
});
