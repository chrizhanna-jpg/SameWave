/**
 * The photo (and optional pre-selected Topic) for the next Ripple, held in
 * memory on the way from the home / camera / library screen to compose.
 * Photo URIs can be very long and do not belong in a navigation link.
 *
 * When the Daily topic button starts the flow, the topic is locked for the
 * whole capture → compose → send path and cannot be changed or swapped via
 * deep-link params (compose never reads topic from the URL).
 */
import type { ChosenPhoto } from "@/device/photos";

let draftPhoto: ChosenPhoto | null = null;
let draftTopic: string | null = null;
let draftTopicLocked = false;

export function setDraftPhoto(photo: ChosenPhoto | null): void {
  draftPhoto = photo;
}

export function getDraftPhoto(): ChosenPhoto | null {
  return draftPhoto;
}

/**
 * Pre-select a Topic. Pass `{ locked: true }` for today's Daily flow so
 * compose hides the picker and always sends that topic.
 */
export function setDraftTopic(topicId: string | null, options?: { locked?: boolean }): void {
  draftTopic = topicId;
  draftTopicLocked = topicId !== null && options?.locked === true;
}

export function getDraftTopic(): string | null {
  return draftTopic;
}

/** True when the Daily button started this Ripple — topic must not change. */
export function isDraftTopicLocked(): boolean {
  return draftTopicLocked && draftTopic !== null;
}

export function clearDraft(): void {
  draftPhoto = null;
  draftTopic = null;
  draftTopicLocked = false;
}
