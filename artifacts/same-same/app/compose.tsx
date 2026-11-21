import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  useWindowDimensions,
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
import { dailyTopicFor } from "@/core/dailyTopic";
import { wavePhotoSlot } from "@/core/wavePhotoSlot";
import { defaultMusicForEmotion } from "@/data/emotionMusic";
import { topicFor } from "@/data/topics";
import { playEffect } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import {
  clearDraft,
  getDraftPhoto,
  getDraftTopic,
  isDraftTopicLocked,
} from "@/state/draft";
import { colors, font, motion, radius, space } from "@/theme";

type SearchField = "emotion" | "topic" | "song" | null;

/**
 * Send a Ripple. After the photo: emotion, Topic, then a library song
 * (pre-selected from the emotion; changeable) and an optional recording.
 *
 * Daily flow: topic is locked in draft memory (not URL params) for the whole
 * capture → compose → send path; the picker is replaced by a chip.
 *
 * While editing fields, the form sits at the top and the photo moves below so
 * the keyboard never jumps the page past the moment/song “curtain”.
 */
export default function ComposeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const slotAspect = wavePhotoSlot(width, height).aspectRatio;
  const { sendRipple } = useAppState();
  const photo = getDraftPhoto();

  // Snapshot lock at mount so URL/deep-link params cannot override a Daily start.
  const topicLocked = useRef(isDraftTopicLocked()).current;
  const lockedTopicId = useRef(
    topicLocked ? dailyTopicFor().id : getDraftTopic(),
  ).current;

  const [emotion, setEmotion] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(() => lockedTopicId);
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

  useEffect(() => {
    if (!photo) router.replace("/");
  }, [photo, router]);

  // Keep a locked Daily topic pinned even if something else tries to change state.
  useEffect(() => {
    if (!topicLocked || !lockedTopicId) return;
    if (topic !== lockedTopicId) setTopic(lockedTopicId);
  }, [topicLocked, lockedTopicId, topic]);

  if (!photo) return null;

  const canSend = !!emotion && !!topic && !!song && !sending && !sent;
  const editingFields = searchField !== null || emotion !== null;
  const lockedLabel = topicFor(lockedTopicId)?.label ?? "Today's topic";

  const bringFieldIntoView = (field: "emotion" | "topic" | "song") => {
    // Reorder puts fields at the top — no scrollTo jump past the curtain.
    setSearchField(field);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const onEmotion = (next: string | null) => {
    setEmotion(next);
    if (!songTouched) setSong(defaultMusicForEmotion(next));
  };

  const onSong = (next: string) => {
    setSongTouched(true);
    setSong(next);
  };

  const onTopicChange = (next: string | null) => {
    if (topicLocked) return;
    setTopic(next);
  };

  const onLayout = (event: LayoutChangeEvent) => {
    box.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  };

  const send = async (event: GestureResponderEvent) => {
    const topicToSend = topicLocked ? dailyTopicFor().id : topic;
    if (!canSend || !emotion || !topicToSend || !song) return;
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
      await sendRipple({ photo, emotion, topic: topicToSend, song, recording });
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

  const photoBlock = (
    <View
      style={[
        styles.photoWrap,
        { aspectRatio: slotAspect },
        editingFields && styles.photoWrapCompact,
      ]}
    >
      <Photo uri={photo.uri} style={styles.photo} accessibilityLabel="Today's photo" />
    </View>
  );

  const fieldsBlock = (
    <>
      <View>
        <Txt variant="heading" style={[styles.section, styles.sectionBold]}>
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
        <View>
          <Txt variant="heading" style={[styles.section, styles.sectionBold]}>
            What&apos;s the moment?
          </Txt>
          {topicLocked ? (
            <View style={styles.lockedChip} accessibilityLabel={`Today's topic: ${lockedLabel}`}>
              <Txt variant="quiet" tone="secondary">
                Today&apos;s topic
              </Txt>
              <Txt>{lockedLabel}</Txt>
            </View>
          ) : (
            <TopicPicker
              value={topic}
              onChange={onTopicChange}
              onSearchFocusChange={(focused) => {
                if (focused) bringFieldIntoView("topic");
                else setSearchField((current) => (current === "topic" ? null : current));
              }}
            />
          )}
        </View>
      ) : null}

      {emotion && topic ? (
        <>
          <View>
            <Txt variant="heading" style={[styles.section, styles.sectionBold]}>
              A sound for it
            </Txt>
            <Txt tone="secondary" style={styles.hint}>
              Picked from how you&apos;re feeling — change it if you like.
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
    </>
  );

  return (
    <Screen scroll scrollRef={scrollRef} contentBottomPad={searchField ? 200 : 48}>
      <Header
        icon="close"
        onPress={() => {
          clearDraft();
          router.replace("/");
        }}
      />

      {/*
        While filling fields: form first (top), photo below — avoids the old
        scrollTo jump that threw the curtain past moment/song.
        Fresh open: photo first, then fields.
      */}
      {editingFields ? (
        <>
          {fieldsBlock}
          {photoBlock}
        </>
      ) : (
        <>
          {photoBlock}
          {fieldsBlock}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoWrap: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 320,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    marginTop: space.md,
  },
  photoWrapCompact: {
    maxWidth: 120,
    aspectRatio: 1,
    borderRadius: radius.md,
    marginTop: space.xl,
    marginBottom: space.lg,
  },
  photo: { width: "100%", height: "100%" },
  section: { marginTop: space.xl, marginBottom: space.sm },
  sectionBold: { fontFamily: font.bold, fontWeight: "700" },
  hint: { marginTop: 0, marginBottom: space.sm },
  lockedChip: {
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: space.xs,
  },
  send: { marginTop: space.xl, position: "relative", overflow: "visible" },
  rings: { position: "absolute", width: 280, height: 280 },
  problem: { marginTop: space.md, marginBottom: space.lg },
});
