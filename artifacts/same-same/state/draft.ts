/**
 * The photo chosen for the next Ripple, on its way from the camera or the
 * library to the send screen. Held in memory only: photo addresses can be
 * very long, and they do not belong in a navigation link.
 */
import type { ChosenPhoto } from "@/device/photos";

let draft: ChosenPhoto | null = null;

export function setDraftPhoto(photo: ChosenPhoto | null): void {
  draft = photo;
}

export function getDraftPhoto(): ChosenPhoto | null {
  return draft;
}
