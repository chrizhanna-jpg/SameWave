import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { Button } from "@/components/Button";
import { EmotionPicker } from "@/components/EmotionPicker";
import { Header } from "@/components/Header";
import { Photo } from "@/components/Photo";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { SoundRecorder, type Recording } from "@/components/SoundRecorder";
import { TopicPicker } from "@/components/TopicPicker";
import { Txt } from "@/components/Txt";
import { errorKind } from "@/backend/types";
import { playEffect } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { getDraftPhoto, setDraftPhoto } from "@/state/draft";
import { colors, motion, radius, space } from "@/theme";

/**
 * Send a Ripple. After the photo: emotion first, then Topic, then an optional
 * song. Matching uses emotion + Topic on top of the server's photo score.
 */
export default function ComposeScreen() {
  const router = useRouter();
  const { sendRipple } = useAppState();
  const photo = getDraftPhoto();

  const [emotion, setEmotion] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
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

  const canSend = !!emotion && !!topic && !sending && !sent;

  const onLayout = (event: LayoutChangeEvent) => {
    box.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  };

  const send = async (event: GestureResponderEvent) => {
    if (!canSend || !emotion || !topic) return;
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
      await sendRipple({ photo, emotion, topic, recording });
      setSent(true);
      setDraftPhoto(null);
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
      <Header
        icon="close"
        onPress={() => {
          setDraftPhoto(null);
          router.replace("/");
        }}
      />

      <View style={styles.photoWrap}>
        <Photo uri={photo.uri} style={styles.photo} accessibilityLabel="Today's photo" />
      </View>

      <Txt variant="heading" style={styles.section}>
        How are you feeling?
      </Txt>
      <EmotionPicker value={emotion} onChange={setEmotion} />

      {emotion ? (
        <>
          <Txt variant="heading" style={styles.section}>
            What's the moment?
          </Txt>
          <TopicPicker value={topic} onChange={setTopic} />
        </>
      ) : null}

      {emotion && topic ? (
        <>
          <Txt variant="heading" style={styles.section}>
            A song (optional)
          </Txt>
          <Txt tone="secondary" style={styles.hint}>
            Record a short sound to travel with the photo.
          </Txt>
          <SoundRecorder value={recording} onChange={setRecording} />
        </>
      ) : null}

      <View style={styles.send} onLayout={onLayout}>
        <Button
          label={sending || sent ? "Sending…" : "Send Ripple"}
          onPress={send}
          busy={sending && !sent}
          disabled={!canSend}
        />
        {tap ? (
          <View pointerEvents="none" style={[styles.rings, { left: tap.x - 140, top: tap.y - 140 }]}>
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
          Matching leans on the emotion and Topic you pick, together with the photo.
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
  hint: { marginTop: space.xs, marginBottom: space.sm },
  send: { marginTop: space.xl, position: "relative", overflow: "visible" },
  rings: { position: "absolute", width: 280, height: 280 },
  problem: { marginTop: space.md, marginBottom: space.lg },
});
