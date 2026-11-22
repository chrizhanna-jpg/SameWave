/**
 * Shared draft for the next Ripple — one source of truth for Home → camera
 * and the Ripple tab compose screen. Photo URIs stay out of navigation links.
 *
 * When the Daily topic button starts the flow, the topic is locked for the
 * whole capture → compose → send path.
 */
import type { ChosenPhoto } from "@/device/photos";
import type { Recording } from "@/components/SoundRecorder";

export type RippleComposeDraft = {
  photo: ChosenPhoto | null;
  emotion: string | null;
  topic: string | null;
  topicLocked: boolean;
  song: string | null;
  songTouched: boolean;
  recording: Recording | null;
};

let draft: RippleComposeDraft = {
  photo: null,
  emotion: null,
  topic: null,
  topicLocked: false,
  song: null,
  songTouched: false,
  recording: null,
};

const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to draft changes (photo / feeling / moment / sound). */
export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Snapshot for `useSyncExternalStore`. MUST return the same reference until
 * a setter publishes — spreading a fresh object here causes
 * "Maximum update depth exceeded" on the Ripple tab.
 */
export function getDraft(): RippleComposeDraft {
  return draft;
}

export function setDraftPhoto(photo: ChosenPhoto | null): void {
  if (draft.photo === photo) return;
  draft = { ...draft, photo };
  publish();
}

export function getDraftPhoto(): ChosenPhoto | null {
  return draft.photo;
}

/**
 * Pre-select a Topic. Pass `{ locked: true }` for today's Daily flow so
 * compose hides the picker and always sends that topic.
 */
export function setDraftTopic(topicId: string | null, options?: { locked?: boolean }): void {
  const topicLocked = topicId !== null && options?.locked === true;
  if (draft.topic === topicId && draft.topicLocked === topicLocked) return;
  draft = {
    ...draft,
    topic: topicId,
    topicLocked,
  };
  publish();
}

export function getDraftTopic(): string | null {
  return draft.topic;
}

/** True when the Daily button started this Ripple — topic must not change. */
export function isDraftTopicLocked(): boolean {
  return draft.topicLocked && draft.topic !== null;
}

export function setDraftEmotion(emotion: string | null): void {
  if (draft.emotion === emotion) return;
  draft = { ...draft, emotion };
  publish();
}

export function getDraftEmotion(): string | null {
  return draft.emotion;
}

export function setDraftSong(song: string | null, options?: { touched?: boolean }): void {
  const songTouched = options?.touched === true ? true : draft.songTouched;
  if (draft.song === song && draft.songTouched === songTouched) return;
  draft = {
    ...draft,
    song,
    songTouched,
  };
  publish();
}

export function getDraftSong(): string | null {
  return draft.song;
}

export function isDraftSongTouched(): boolean {
  return draft.songTouched;
}

export function setDraftRecording(recording: Recording | null): void {
  if (draft.recording === recording) return;
  draft = { ...draft, recording };
  publish();
}

export function getDraftRecording(): Recording | null {
  return draft.recording;
}

/** After a successful send (or an explicit abandon of the whole draft). */
export function clearDraft(): void {
  draft = {
    photo: null,
    emotion: null,
    topic: null,
    topicLocked: false,
    song: null,
    songTouched: false,
    recording: null,
  };
  publish();
}
