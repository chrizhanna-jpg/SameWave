import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import { Button } from "@/components/Button";
import { EmotionPicker } from "@/components/EmotionPicker";
import { Frost } from "@/components/Frost";
import { Photo } from "@/components/Photo";
import { Screen } from "@/components/Screen";
import { SongPicker } from "@/components/SongPicker";
import { SoundRecorder } from "@/components/SoundRecorder";
import { TopicPicker } from "@/components/TopicPicker";
import { Txt } from "@/components/Txt";
import { errorKind } from "@/backend/types";
import { dailyTopicFor } from "@/core/dailyTopic";
import { wavePhotoSlot } from "@/core/wavePhotoSlot";
import { sceneFor } from "@/data/scenes";
import { defaultMusicForEmotion } from "@/data/emotionMusic";
import { topicFor } from "@/data/topics";
import { chooseFromLibrary } from "@/device/photos";
import { playOceanSound } from "@/device/sound";
import { useAppState } from "@/state/AppState";
import {
  clearDraft,
  getDraft,
  isDraftTopicLocked,
  setDraftEmotion,
  setDraftPhoto,
  setDraftRecording,
  setDraftSong,
  setDraftTopic,
  subscribeDraft,
} from "@/state/draft";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { colors, font, motion, radius, space } from "@/theme";

/** Fixed preview width (pt). Height comes from match-screen slotAspect. */
const PREVIEW_WIDTH = 128;

function useDraft() {
  return useSyncExternalStore(subscribeDraft, getDraft, getDraft);
}

function missingHint(photo: boolean, emotion: boolean, topic: boolean): string {
  const missing: string[] = [];
  if (!photo) missing.push("a photo");
  if (!emotion) missing.push("a feeling");
  if (!topic) missing.push("a topic");
  if (missing.length === 0) return "";
  if (missing.length === 1) return `Add ${missing[0]} to upload.`;
  if (missing.length === 2) return `Add ${missing[0]} and ${missing[1]} to upload.`;
  return `Add ${missing[0]}, ${missing[1]} and ${missing[2]} to upload.`;
}

/**
 * Shared compose UI for the Ripple tab (and the legacy /compose redirect).
 * Photo can be missing — Add a photo / Change photo reuse capture + library.
 * Feeling and topic are always available; sound follows the feeling.
 */
export function ComposeRipple({ embeddedInTab = true }: { embeddedInTab?: boolean }) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const slotAspect = wavePhotoSlot(width, height).aspectRatio;
  const previewHeight = Math.max(1, Math.round(PREVIEW_WIDTH / slotAspect));
  const { sendRipple } = useAppState();
  const draft = useDraft();
  const tabClearance = useTabBarClearance(space.xl);

  const topicLocked = isDraftTopicLocked();
  const lockedTopicId = topicLocked ? draft.topic : null;
  const lockedLabel = topicFor(lockedTopicId)?.label ?? "Today's topic";

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Keep locked Daily topic pinned.
  useEffect(() => {
    if (!topicLocked || !lockedTopicId) return;
    if (draft.topic !== lockedTopicId) setDraftTopic(lockedTopicId, { locked: true });
  }, [topicLocked, lockedTopicId, draft.topic]);

  // Auto-pick a library song when the feeling changes (until the user overrides).
  useEffect(() => {
    if (draft.songTouched) return;
    const next = defaultMusicForEmotion(draft.emotion);
    if (next !== draft.song) setDraftSong(next);
  }, [draft.emotion, draft.song, draft.songTouched]);

  const photo = draft.photo;
  const canSend =
    Boolean(photo && draft.emotion && draft.topic && draft.song) && !sending && !sent;
  const hint = missingHint(Boolean(photo), Boolean(draft.emotion), Boolean(draft.topic));

  const onEmotion = (next: string | null) => {
    setDraftEmotion(next);
    if (!draft.songTouched) setDraftSong(defaultMusicForEmotion(next));
  };

  const onSong = (next: string) => {
    setDraftSong(next, { touched: true });
  };

  const onTopicChange = (next: string | null) => {
    if (topicLocked) return;
    setDraftTopic(next);
  };

  const addPhotoCamera = () => {
    router.push("/capture");
  };

  const addPhotoLibrary = async () => {
    setProblem(null);
    setPicking(true);
    try {
      const chosen = await chooseFromLibrary();
      if (!chosen) return;
      void playOceanSound();
      setDraftPhoto(chosen);
    } catch {
      setProblem("That photo couldn't be opened. Try another.");
    } finally {
      setPicking(false);
    }
  };

  const send = async () => {
    const topicToSend = topicLocked ? dailyTopicFor().id : draft.topic;
    if (!canSend || !photo || !draft.emotion || !topicToSend || !draft.song) return;
    setSending(true);
    setProblem(null);
    // Upload moment is silent — Match owns ripple/wave cues; splash owns the swell.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    try {
      const uploaded = await sendRipple({
        photo,
        emotion: draft.emotion,
        topic: topicToSend,
        song: draft.song,
        recording: draft.recording,
      });
      setSent(true);
      clearDraft();
      setTimeout(
        () =>
          router.replace({
            pathname: "/match",
            params: { photoId: uploaded.photoId },
          }),
        motion.rippleSend,
      );
    } catch (error) {
      setSending(false);
      const kind = errorKind(error);
      setProblem(
        kind === "unreachable"
          ? "Can't reach SameWave right now. Your photo is still here — try again in a moment."
          : kind === "signed-out"
            ? "Your session ended. Sign in again, then upload."
            : "That moment didn't upload. Please try again.",
      );
    }
  };

  return (
    <Screen
      scroll
      reserveBottom={embeddedInTab ? tabClearance : undefined}
      contentBottomPad={embeddedInTab ? undefined : 48}
      photoUri={photo?.uri ?? null}
      scene={sceneFor.composeFallback}
    >
      {/*
        Stable order: photo (or Add a photo), then feeling / topic / sound.
        Feeling and topic stay available with no photo so selections survive
        a trip to the camera.
      */}
      <Frost kind="card" style={styles.photoCard} contentStyle={styles.photoCardPad}>
        {photo ? (
          <>
            <View style={[styles.photoWrap, { width: PREVIEW_WIDTH, height: previewHeight }]}>
              <Photo uri={photo.uri} style={styles.photo} accessibilityLabel="Today's photo" />
            </View>
            <View style={styles.photoActions}>
              {Platform.OS !== "web" ? (
                <Button kind="quiet" label="Retake" onPress={addPhotoCamera} />
              ) : null}
              <Button
                kind="quiet"
                label="Choose another"
                onPress={() => void addPhotoLibrary()}
                busy={picking}
              />
            </View>
          </>
        ) : (
          <View style={styles.addPhoto}>
            <Txt variant="heading" style={styles.sectionBold}>
              Add a photo
            </Txt>
            <Txt tone="secondary" center style={styles.addHint}>
              Camera or your library — feeling and topic can wait, or come first.
            </Txt>
            {Platform.OS !== "web" ? (
              <Button label="Open camera" onPress={addPhotoCamera} style={styles.addBtn} />
            ) : null}
            <Button
              kind="soft"
              label="Choose from library"
              onPress={() => void addPhotoLibrary()}
              busy={picking}
              style={styles.addBtn}
            />
          </View>
        )}
      </Frost>

      <Frost kind="card" style={styles.card} contentStyle={styles.cardPad}>
        <View>
          <Txt variant="heading" style={[styles.section, styles.sectionBold]}>
            This feels…
          </Txt>
          <EmotionPicker value={draft.emotion} onChange={onEmotion} />
        </View>

        <View>
          <Txt variant="heading" style={[styles.section, styles.sectionBold]}>
            What&apos;s the topic?
          </Txt>
          {topicLocked ? (
            <View style={styles.lockedChip} accessibilityLabel={`Today's topic: ${lockedLabel}`}>
              <Txt variant="quiet" tone="secondary">
                Today&apos;s topic
              </Txt>
              <Txt>{lockedLabel}</Txt>
            </View>
          ) : (
            <TopicPicker value={draft.topic} onChange={onTopicChange} />
          )}
        </View>

        {draft.emotion ? (
          <>
            <View>
              <Txt variant="heading" style={[styles.section, styles.sectionBold]}>
                A sound for it
              </Txt>
              <Txt tone="secondary" style={styles.hint}>
                Picked from how you&apos;re feeling — change it if you like.
              </Txt>
              <SongPicker
                value={draft.song}
                onChange={onSong}
                previewSeed={photo?.uri ?? draft.emotion}
              />
            </View>

            <Txt variant="heading" style={styles.section}>
              Or record your own (optional)
            </Txt>
            <Txt tone="secondary" style={styles.hint}>
              A short sound of your own travels instead of the library song.
            </Txt>
            <SoundRecorder value={draft.recording} onChange={setDraftRecording} />
          </>
        ) : null}
      </Frost>

      {/* Outside the frost card so a hairline never strikes through the label. */}
      <View style={styles.send}>
        <Button
          label={sending || sent ? "Uploading…" : "Upload moment"}
          onPress={() => void send()}
          busy={sending && !sent}
          disabled={!canSend}
          accessibilityHint={canSend ? "Uploads this moment to SameWave" : hint}
        />
        {!canSend && !sending ? (
          <Txt variant="quiet" tone="secondary" center style={styles.missing}>
            {hint}
          </Txt>
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
  card: { marginTop: space.sm, marginBottom: space.md },
  cardPad: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  photoCard: { marginTop: space.sm, marginBottom: space.md },
  photoCardPad: { padding: space.md, alignItems: "center" },
  photoWrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  photo: { width: "100%", height: "100%" },
  photoActions: { marginTop: space.sm, alignItems: "center", gap: space.xs },
  addPhoto: { alignItems: "center", gap: space.sm, paddingVertical: space.md },
  addHint: { maxWidth: 280, marginBottom: space.sm },
  addBtn: { alignSelf: "stretch" },
  section: { marginTop: space.xl, marginBottom: space.sm },
  sectionBold: { fontFamily: font.bold, fontWeight: "700" },
  hint: { marginTop: 0, marginBottom: space.sm },
  lockedChip: {
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(222, 242, 254, 0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: space.xs,
  },
  send: {
    marginTop: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
  },
  missing: { marginTop: space.sm },
  problem: { marginTop: space.md, marginBottom: space.lg, paddingHorizontal: space.lg },
});
