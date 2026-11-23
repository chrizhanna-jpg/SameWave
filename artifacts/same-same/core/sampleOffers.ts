/**
 * Preview-only inbox fixtures so the Wave tab can be exercised without
 * production writes. Gated by testPhotosBuildEnabled() — never in release.
 */
import type { ImageSource } from "expo-image";

import type { Offer, Wave } from "./types";
import { testPhotosBuildEnabled } from "./testPhotos";

const PREVIEW_OFFER_ID = "preview-inbox-offer-1";

/** Sample Wave formed when the preview Ripple is matched back (TEST_PHOTOS). */
export const PREVIEW_OFFER_WAVE_ID = "test_wave_same_minute";

/** Preview mine / theirs align with same_minute fixture (test_sample_01/02). */
export const PREVIEW_OFFER_MY_PHOTO_ID = "test_sample_01";
export const PREVIEW_OFFER_THEIR_PHOTO_ID = "test_sample_02";

type PreviewOfferResolution = "accepted" | "dismissed";

/** In-memory only — preview session; never persisted. */
let previewOfferResolution: PreviewOfferResolution | null = null;

export function peekPreviewOfferResolution(): PreviewOfferResolution | null {
  return previewOfferResolution;
}

/** Mark the preview Ripple decided so it leaves Ripples received. */
export function resolvePreviewOffer(verdict: PreviewOfferResolution): void {
  if (!testPhotosBuildEnabled()) return;
  previewOfferResolution = verdict;
}

/** Test helper — reset between cases. */
export function resetPreviewOfferResolution(): void {
  previewOfferResolution = null;
}

/**
 * Wave to show under Waves after a preview match-back.
 * Returns null when not accepted / flag off / fixture missing.
 * Lazy-loads the catalog so Node unit tests never pull React Native.
 */
export function previewWaveAfterAccept(): Wave | null {
  if (!testPhotosBuildEnabled()) return null;
  if (previewOfferResolution !== "accepted") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require("../assets/test-photos/catalog") as {
      getSampleWaves: () => Wave[];
    };
    return catalog.getSampleWaves().find((w) => w.id === PREVIEW_OFFER_WAVE_ID) ?? null;
  } catch {
    // Node tests lack Metro's JPEG asset transformer — minimal Wave shape.
    return {
      id: PREVIEW_OFFER_WAVE_ID,
      formedAt: "2026-06-15T12:00:00+01:00",
      mine: {
        photoId: PREVIEW_OFFER_MY_PHOTO_ID,
        uri: null,
        countryCode: "GB",
        countrySource: "photo",
        takenAt: "2026-06-15T12:00:00+01:00",
        theme: "mountains",
        emotion: "calm",
      },
      theirs: {
        photoId: PREVIEW_OFFER_THEIR_PHOTO_ID,
        uri: null,
        countryCode: "GB",
        countrySource: "photo",
        takenAt: "2026-06-15T12:00:45+01:00",
        theme: "coffee",
        emotion: "joy",
      },
    };
  }
}

function bundledThumb(
  load: () => ImageSource,
  fallbackUri: string,
): ImageSource | null {
  if (!testPhotosBuildEnabled()) return null;
  try {
    return load();
  } catch {
    // Node unit tests lack Metro's JPEG asset transformer.
    return { uri: fallbackUri };
  }
}

/** Bundled thumb for their side of the preview inbox card. */
export function previewOfferTheirThumbSource(): ImageSource | null {
  return bundledThumb(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    () => require("../assets/test-photos/02-coffee-hands.jpg") as ImageSource,
    "test-photos://02-coffee-hands.jpg",
  );
}

/** Bundled thumb for your side of the preview inbox card. */
export function previewOfferMyThumbSource(): ImageSource | null {
  return bundledThumb(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    () => require("../assets/test-photos/01-mountain-lake.jpg") as ImageSource,
    "test-photos://01-mountain-lake.jpg",
  );
}

/** @deprecated use previewOfferTheirThumbSource */
export function previewOfferThumbSource(): ImageSource | null {
  return previewOfferTheirThumbSource();
}

/** Resolve a URI when Image.resolveAssetSource works (native / some web). */
function previewUriAt(index: number): string | null {
  if (!testPhotosBuildEnabled()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require("../assets/test-photos/catalog") as {
      getTestPhotoCandidates: () => { uri: string }[];
    };
    const rows = catalog.getTestPhotoCandidates();
    return rows[index]?.uri ?? rows[0]?.uri ?? null;
  } catch {
    return null;
  }
}

function previewOffer(): Offer {
  return {
    id: PREVIEW_OFFER_ID,
    myPhotoId: PREVIEW_OFFER_MY_PHOTO_ID,
    theirPhotoId: PREVIEW_OFFER_THEIR_PHOTO_ID,
    createdAt: "2026-11-20T14:30:00.000Z",
    myUri: previewUriAt(0),
    theirUri: previewUriAt(1),
    theirEmotion: "joy",
    theirTopic: "coffee",
    theirCountryCode: "FR",
  };
}

/** One mocked pending offer for Expo preview / Maestro when the flag is on. */
export function withOptionalSampleOffers(offers: readonly Offer[]): Offer[] {
  if (!testPhotosBuildEnabled()) return [...offers];
  if (previewOfferResolution) return [...offers];
  if (offers.some((o) => o.id === PREVIEW_OFFER_ID)) return [...offers];
  // Prefer live inbox when present; otherwise seed one card for UI/E2E.
  if (offers.length > 0) return [...offers];
  return [previewOffer()];
}

export function isPreviewOfferId(id: string): boolean {
  return id === PREVIEW_OFFER_ID;
}

/** Lookup pending offer including the preview seed (when not yet resolved). */
export function findOfferIncludingPreview(
  offers: readonly Offer[],
  offerId: string,
): Offer | null {
  const live = offers.find((o) => o.id === offerId);
  if (live) return live;
  if (!isPreviewOfferId(offerId) || !testPhotosBuildEnabled()) return null;
  if (previewOfferResolution) return null;
  return previewOffer();
}

/** Their photo source for an inbox thumb — live URI or preview JPEG. */
export function inboxOfferTheirThumbSource(offer: Offer): ImageSource | null {
  if (offer.theirUri) return { uri: offer.theirUri };
  if (isPreviewOfferId(offer.id)) return previewOfferTheirThumbSource();
  return null;
}

/** Your photo source for an inbox thumb — live URI or preview JPEG. */
export function inboxOfferMyThumbSource(offer: Offer): ImageSource | null {
  if (offer.myUri) return { uri: offer.myUri };
  if (isPreviewOfferId(offer.id)) return previewOfferMyThumbSource();
  return null;
}

/** @deprecated use inboxOfferTheirThumbSource */
export function inboxOfferThumbSource(offer: Offer): ImageSource | null {
  return inboxOfferTheirThumbSource(offer);
}
