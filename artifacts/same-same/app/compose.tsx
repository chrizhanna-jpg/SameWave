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
import { Screen, type ScreenScroll } from "@/components/Screen";
import { SongPicker } from "@/components/SongPicker";
import { SoundRecorder, type Recording } from "@/components/SoundRecorder";
import { TopicPicker } from "@/components/TopicPicker";
import { Txt } from "@/components/Txt";
import { errorKind } from "@/backend/types";
import { defaultMusicForEmotion } from "@/data/emotionMusic";
import { playEffect } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import { clearDraft, getDraftPhoto, getDraftTopic } from "@/state/draft";
import { colors, motion, radius, space } from "@/theme";

type SearchField = "emotion" | "topic" | "song" | null;

/**
 * Send a Ripple. After the photo: emotion, Topic, then a library song
 * (pre-selected from the emotion; changeable) and an optional recording.
 * A Daily topic from home arrives already filled on the Topic step.
 *
 * While a search field is focused the photo shrinks and the screen scrolls
 * so the field and its filtered list stay above the keyboard.
 */
export default function ComposeScreen() {
  const router = useRouter();
  const { sendRipple } = useAppState();
  const photo = getDraftPhoto();

  const prefilledTopic = useRef(getDraftTopic()).current;
  const [emotion, setEmotion] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(() => prefilledTopic);
  const [song, setSong] = useState<string | null>(null);
  const [songTouched, setSongTouched] = useState(false);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  const [searchField, setSearchField] = useState<SearchField>(null);
  const box = useRef({ width: 0, height: 0 });
  const scrollRef = useRef<ScreenScroll | null>(null);
  const sectionY = useRef<Record<"emotion" | "topic" | "song", number>>({
    emotion: 0,
    topic: 0,
    song: 0,
  });

  useEffect(() => {
    if (!photo) router.replace("/");
  }, [photo, router]);

  useEffect(() => {
    if (!searchField) return;
    // After the photo shrinks, scroll so the active search sits near the top.
    const timer = setTimeout(() => {
      const y = Math.max(0, sectionY.current[searchField] - space.md);
      scrollRef.current?.scrollTo({ y, animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [searchField]);

  if (!photo) return null;

  const canSend = !!emotion && !!topic && !!song && !sending && !sent;
  const searching = searchField !== null;

  const bringFieldIntoView = (field: "emotion" | "topic" | "song") => {
    setSearchField(field);
  };

  const onEmotion = (next: string | null) => {
    setEmotion(next);
    if (!songTouched) setSong(defaultMusicForEmotion(next));
  };

  const onSong = (next: string) => {
    setSongTouched(true);
    setSong(next);
  };

  const onLayout = (event: LayoutChangeEvent) => {
    box.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  };

  const markSection =
    (field: "emotion" | "topic" | "song") => (event: LayoutChangeEvent) => {
      sectionY.current[field] = event.nativeEvent.layout.y;
    };

  const send = async (event: GestureResponderEvent) => {
    if (!canSend || !emotion || !topic || !song) return;
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
      await sendRipple({ photo, emotion, topic, song, recording });
      setSent(true);
      clearDraft();
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
    <Screen scroll scrollRef={scrollRef} contentBottomPad={searching ? 280 : 48}>
      <Header
        icon="close"
        onPress={() => {
          clearDraft();
          router.replace("/");
        }}
      />

      <View style={[styles.photoWrap, searching && styles.photoWrapCompact]}>
        <Photo uri={photo.uri} style={styles.photo} accessibilityLabel="Today's photo" />
      </View>

      <View onLayout={markSection("emotion")}>
        <Txt variant="heading" style={styles.section}>
          This feels…
        </Txt>
        <EmotionPicker
          value={emotion}
          onChange={onEmotion}
          onSearchFocusChange={(focused) => {
            if (focused) bringFieldIntoView("emotion");
            else setSearchField((current) => (current === "emotion" ? null : current));
          }}
        />
      </View>

      {emotion ? (
        <View onLayout={markSection("topic")}>
          <Txt variant="heading" style={styles.section}>
            What's the moment?
          </Txt>
          {prefilledTopic && topic === prefilledTopic ? (
            <Txt tone="secondary" style={styles.hint}>
              Today's topic — change it if you like.
            </Txt>
          ) : null}
          <TopicPicker
            value={topic}
            onChange={setTopic}
            onSearchFocusChange={(focused) => {
              if (focused) bringFieldIntoView("topic");
              else setSearchField((current) => (current === "topic" ? null : current));
            }}
          />
        </View>
      ) : null}

      {emotion && topic ? (
        <>
          <View onLayout={markSection("song")}>
            <Txt variant="heading" style={styles.section}>
              A song for it
            </Txt>
            <Txt tone="secondary" style={styles.hint}>
              Picked from how you're feeling — change it if you like.
            </Txt>
            <SongPicker
              value={song}
              onChange={onSong}
              previewSeed={photo.uri}
              onSearchFocusChange={(focused) => {
                if (focused) bringFieldIntoView("song");
                else setSearchField((current) => (current === "song" ? null : current));
              }}
            />
          </View>

          <Txt variant="heading" style={styles.section}>
            Or record your own (optional)
          </Txt>
          <Txt tone="secondary" style={styles.hint}>
            A short sound of your own travels instead of the library song.
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
  /** While typing, free vertical space so the search stays above the keyboard. */
  photoWrapCompact: {
    maxWidth: 120,
    aspectRatio: 1,
    borderRadius: radius.md,
  },
  photo: { width: "100%", height: "100%" },
  section: { marginTop: space.xl, marginBottom: space.sm },
  hint: { marginTop: 0, marginBottom: space.sm },
  send: { marginTop: space.xl, position: "relative", overflow: "visible" },
  rings: { position: "absolute", width: 280, height: 280 },
  problem: { marginTop: space.md, marginBottom: space.lg },
});
