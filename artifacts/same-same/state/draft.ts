/**
 * The photo (and optional pre-selected Topic) for the next Ripple, held in
 * memory on the way from the home / camera / library screen to compose.
 * Photo URIs can be very long and do not belong in a navigation link.
 */
import type { ChosenPhoto } from "@/device/photos";

let draftPhoto: ChosenPhoto | null = null;
let draftTopic: string | null = null;

export function setDraftPhoto(photo: ChosenPhoto | null): void {
  draftPhoto = photo;
}

export function getDraftPhoto(): ChosenPhoto | null {
  return draftPhoto;
}

/** Pre-select a Topic (e.g. today's Daily topic). Cleared when compose closes. */
export function setDraftTopic(topicId: string | null): void {
  draftTopic = topicId;
}

export function getDraftTopic(): string | null {
  return draftTopic;
}

export function clearDraft(): void {
  draftPhoto = null;
  draftTopic = null;
}
