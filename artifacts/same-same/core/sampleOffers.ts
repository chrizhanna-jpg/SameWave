/**
 * Preview-only inbox fixtures so the Wave tab can be exercised without
 * production writes. Gated by testPhotosBuildEnabled() — never in release.
 */
import type { ImageSource } from "expo-image";

import type { Offer } from "./types";
import { testPhotosBuildEnabled } from "./testPhotos";

const PREVIEW_OFFER_ID = "preview-inbox-offer-1";

/** Bundled thumb for the preview inbox card (Metro-omitted when flag is off). */
export function previewOfferThumbSource(): ImageSource | null {
  if (!testPhotosBuildEnabled()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../assets/test-photos/02-coffee-hands.jpg") as ImageSource;
  } catch {
    // Node unit tests lack Metro's JPEG asset transformer.
    return { uri: "test-photos://02-coffee-hands.jpg" };
  }
}

/** Resolve a URI when Image.resolveAssetSource works (native / some web). */
function previewTheirUri(): string | null {
  if (!testPhotosBuildEnabled()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require("../assets/test-photos/catalog") as {
      getTestPhotoCandidates: () => { uri: string }[];
    };
    const rows = catalog.getTestPhotoCandidates();
    return rows[1]?.uri ?? rows[0]?.uri ?? null;
  } catch {
    return null;
  }
}

function previewOffer(): Offer {
  return {
    id: PREVIEW_OFFER_ID,
    myPhotoId: "preview-mine-1",
    theirPhotoId: "preview-theirs-1",
    createdAt: "2026-11-20T14:30:00.000Z",
    theirUri: previewTheirUri(),
    theirEmotion: "joy",
    theirTopic: "coffee",
    theirCountryCode: "FR",
  };
}

/** One mocked pending offer for Expo preview / Maestro when the flag is on. */
export function withOptionalSampleOffers(offers: readonly Offer[]): Offer[] {
  if (!testPhotosBuildEnabled()) return [...offers];
  if (offers.some((o) => o.id === PREVIEW_OFFER_ID)) return [...offers];
  // Prefer live inbox when present; otherwise seed one card for UI/E2E.
  if (offers.length > 0) return [...offers];
  return [previewOffer()];
}

export function isPreviewOfferId(id: string): boolean {
  return id === PREVIEW_OFFER_ID;
}

/** Image source for an inbox thumb — live URI or preview JPEG. */
export function inboxOfferThumbSource(offer: Offer): ImageSource | null {
  if (offer.theirUri) return { uri: offer.theirUri };
  if (isPreviewOfferId(offer.id)) return previewOfferThumbSource();
  return null;
}
