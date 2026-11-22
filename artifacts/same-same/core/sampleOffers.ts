/**
 * Preview-only inbox fixtures so the Wave tab can be exercised without
 * production writes. Gated by testPhotosBuildEnabled() — never in release.
 */
import type { Offer } from "./types";
import { testPhotosBuildEnabled } from "./testPhotos";

const PREVIEW_OFFER: Offer = {
  id: "preview-inbox-offer-1",
  myPhotoId: "preview-mine-1",
  theirPhotoId: "preview-theirs-1",
  createdAt: "2026-11-20T14:30:00.000Z",
  theirUri: null,
  theirEmotion: "joy",
  theirTopic: "coffee",
  theirCountryCode: "FR",
};

/** One mocked pending offer for Expo preview / Maestro when the flag is on. */
export function withOptionalSampleOffers(offers: readonly Offer[]): Offer[] {
  if (!testPhotosBuildEnabled()) return [...offers];
  if (offers.some((o) => o.id === PREVIEW_OFFER.id)) return [...offers];
  // Prefer live inbox when present; otherwise seed one card for UI/E2E.
  if (offers.length > 0) return [...offers];
  return [PREVIEW_OFFER];
}

export function isPreviewOfferId(id: string): boolean {
  return id === PREVIEW_OFFER.id;
}
