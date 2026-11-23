/**
 * Preview-only inbox fixtures so Ripples received / Waves can be exercised
 * without production or Neon writes. Gated by testPhotosBuildEnabled() —
 * never in release builds. User toggle: Account → Sample data.
 */
import type { ImageSource } from "expo-image";

import type { Offer, Wave } from "./types";
import { peekSamplePhotosToggle, testPhotosBuildEnabled } from "./testPhotos";

const PREVIEW_OFFER_ID_PREFIX = "preview-inbox-offer-";

/** @deprecated prefer previewWaveIdForOffer — first fixture still maps here. */
export const PREVIEW_OFFER_WAVE_ID = "test_wave_same_minute";
export const PREVIEW_OFFER_MY_PHOTO_ID = "test_sample_01";
export const PREVIEW_OFFER_THEIR_PHOTO_ID = "test_sample_02";

type PreviewOfferResolution = "accepted" | "dismissed";

type PreviewOfferSpec = {
  id: string;
  /** Fixture Wave id formed on local match-back. */
  waveId: string;
  mineIdx: number;
  theirsIdx: number;
  minePhotoId: string;
  theirPhotoId: string;
  theirEmotion: string;
  theirTopic: string;
  theirCountryCode: string;
  createdAt: string;
};

/** A few pending sample Ripples — bundled JPEGs only, never POSTed. */
export const PREVIEW_OFFER_SPECS: readonly PreviewOfferSpec[] = [
  {
    id: `${PREVIEW_OFFER_ID_PREFIX}1`,
    waveId: "test_wave_same_minute",
    mineIdx: 0,
    theirsIdx: 1,
    minePhotoId: "test_sample_01",
    theirPhotoId: "test_sample_02",
    theirEmotion: "joy",
    theirTopic: "coffee",
    theirCountryCode: "GB",
    createdAt: "2026-11-20T14:30:00.000Z",
  },
  {
    id: `${PREVIEW_OFFER_ID_PREFIX}2`,
    waveId: "test_wave_same_hour",
    mineIdx: 0,
    theirsIdx: 2,
    minePhotoId: "test_sample_01",
    theirPhotoId: "test_sample_03",
    theirEmotion: "hope",
    theirTopic: "nature",
    theirCountryCode: "FR",
    createdAt: "2026-11-19T11:05:00.000Z",
  },
  {
    id: `${PREVIEW_OFFER_ID_PREFIX}3`,
    waveId: "test_wave_same_day",
    mineIdx: 0,
    theirsIdx: 3,
    minePhotoId: "test_sample_01",
    theirPhotoId: "test_sample_04",
    theirEmotion: "gratitude",
    theirTopic: "countryside",
    theirCountryCode: "DE",
    createdAt: "2026-11-18T18:20:00.000Z",
  },
];

/** In-memory only — preview session; never persisted / never sent to API. */
const previewOfferVerdicts = new Map<string, PreviewOfferResolution>();

export function peekPreviewOfferResolution(
  offerId?: string,
): PreviewOfferResolution | null {
  if (offerId) return previewOfferVerdicts.get(offerId) ?? null;
  // Legacy: any verdict (tests that used a single global).
  const first = previewOfferVerdicts.values().next();
  return first.done ? null : first.value;
}

/** Mark a sample Ripple decided — leaves Ripples received; no network. */
export function resolvePreviewOffer(
  offerId: string,
  verdict: PreviewOfferResolution,
): void {
  if (!testPhotosBuildEnabled()) return;
  if (!isPreviewOfferId(offerId)) return;
  previewOfferVerdicts.set(offerId, verdict);
}

/** Test helper — reset between cases. */
export function resetPreviewOfferResolution(): void {
  previewOfferVerdicts.clear();
}

export function isPreviewOfferId(id: string): boolean {
  return id.startsWith(PREVIEW_OFFER_ID_PREFIX);
}

export function previewWaveIdForOffer(offerId: string): string | null {
  return PREVIEW_OFFER_SPECS.find((s) => s.id === offerId)?.waveId ?? null;
}

function specFor(offerId: string): PreviewOfferSpec | null {
  return PREVIEW_OFFER_SPECS.find((s) => s.id === offerId) ?? null;
}

/**
 * Wave to show under Waves after a sample match-back.
 * Lazy-loads the catalog so Node unit tests never pull React Native.
 */
export function previewWaveAfterAccept(offerId?: string): Wave | null {
  if (!testPhotosBuildEnabled()) return null;
  const id = offerId ?? PREVIEW_OFFER_SPECS[0]!.id;
  if (previewOfferVerdicts.get(id) !== "accepted") return null;
  const spec = specFor(id);
  if (!spec) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const catalog = require("../assets/test-photos/catalog") as {
      getSampleWaves: () => Wave[];
    };
    return catalog.getSampleWaves().find((w) => w.id === spec.waveId) ?? null;
  } catch {
    return {
      id: spec.waveId,
      formedAt: spec.createdAt,
      mine: {
        photoId: spec.minePhotoId,
        uri: null,
        countryCode: "GB",
        countrySource: "photo",
        takenAt: spec.createdAt,
        theme: "mountains",
        emotion: "calm",
      },
      theirs: {
        photoId: spec.theirPhotoId,
        uri: null,
        countryCode: spec.theirCountryCode,
        countrySource: "photo",
        takenAt: spec.createdAt,
        theme: spec.theirTopic,
        emotion: spec.theirEmotion,
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
    return { uri: fallbackUri };
  }
}

/** Static requires — Metro cannot resolve template-string require paths. */
const THUMB_SOURCES: ReadonlyArray<{ load: () => ImageSource; fallback: string }> = [
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    load: () => require("../assets/test-photos/01-mountain-lake.jpg") as ImageSource,
    fallback: "test-photos://01-mountain-lake.jpg",
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    load: () => require("../assets/test-photos/02-coffee-hands.jpg") as ImageSource,
    fallback: "test-photos://02-coffee-hands.jpg",
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    load: () => require("../assets/test-photos/03-forest-path.jpg") as ImageSource,
    fallback: "test-photos://03-forest-path.jpg",
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    load: () => require("../assets/test-photos/04-sunlit-hills.jpg") as ImageSource,
    fallback: "test-photos://04-sunlit-hills.jpg",
  },
];

function bundledThumbAt(index: number): ImageSource | null {
  const entry = THUMB_SOURCES[index] ?? THUMB_SOURCES[0]!;
  return bundledThumb(entry.load, entry.fallback);
}

/** Bundled thumb for their side of the first preview inbox card. */
export function previewOfferTheirThumbSource(): ImageSource | null {
  return bundledThumbAt(1);
}

/** Bundled thumb for your side of the first preview inbox card. */
export function previewOfferMyThumbSource(): ImageSource | null {
  return bundledThumbAt(0);
}

/** @deprecated use previewOfferTheirThumbSource */
export function previewOfferThumbSource(): ImageSource | null {
  return previewOfferTheirThumbSource();
}

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

function offerFromSpec(spec: PreviewOfferSpec): Offer {
  return {
    id: spec.id,
    myPhotoId: spec.minePhotoId,
    theirPhotoId: spec.theirPhotoId,
    createdAt: spec.createdAt,
    myUri: previewUriAt(spec.mineIdx),
    theirUri: previewUriAt(spec.theirsIdx),
    theirEmotion: spec.theirEmotion,
    theirTopic: spec.theirTopic,
    theirCountryCode: spec.theirCountryCode,
  };
}

function sampleDataWanted(explicit?: boolean): boolean {
  if (!testPhotosBuildEnabled()) return false;
  if (typeof explicit === "boolean") return explicit;
  // Default ON once the toggle has been read (preview convenience).
  return peekSamplePhotosToggle() !== false;
}

/**
 * Pending sample Ripples for Expo preview when Sample data is on.
 * Never written to the API. Live offers stay; samples append when missing.
 */
export function withOptionalSampleOffers(
  offers: readonly Offer[],
  opts?: { useSampleData?: boolean },
): Offer[] {
  if (!testPhotosBuildEnabled()) return [...offers];
  if (!sampleDataWanted(opts?.useSampleData)) {
    return offers.filter((o) => !isPreviewOfferId(o.id));
  }
  const live = offers.filter((o) => !isPreviewOfferId(o.id));
  const liveIds = new Set(live.map((o) => o.id));
  const samples = PREVIEW_OFFER_SPECS.filter(
    (s) => !previewOfferVerdicts.has(s.id) && !liveIds.has(s.id),
  ).map(offerFromSpec);
  return [...samples, ...live];
}

/** Lookup pending offer including a sample seed (when Sample data is on). */
export function findOfferIncludingPreview(
  offers: readonly Offer[],
  offerId: string,
): Offer | null {
  const live = offers.find((o) => o.id === offerId);
  if (live) return live;
  if (!isPreviewOfferId(offerId) || !testPhotosBuildEnabled()) return null;
  if (previewOfferVerdicts.has(offerId)) return null;
  if (!sampleDataWanted()) return null;
  const spec = specFor(offerId);
  return spec ? offerFromSpec(spec) : null;
}

/** Their photo source for an inbox thumb — live URI or preview JPEG. */
export function inboxOfferTheirThumbSource(offer: Offer): ImageSource | null {
  if (offer.theirUri) return { uri: offer.theirUri };
  if (!isPreviewOfferId(offer.id)) return null;
  const spec = specFor(offer.id);
  return bundledThumbAt(spec?.theirsIdx ?? 1);
}

/** Your photo source for an inbox thumb — live URI or preview JPEG. */
export function inboxOfferMyThumbSource(offer: Offer): ImageSource | null {
  if (offer.myUri) return { uri: offer.myUri };
  if (!isPreviewOfferId(offer.id)) return null;
  const spec = specFor(offer.id);
  return bundledThumbAt(spec?.mineIdx ?? 0);
}

/** @deprecated use inboxOfferTheirThumbSource */
export function inboxOfferThumbSource(offer: Offer): ImageSource | null {
  return inboxOfferTheirThumbSource(offer);
}
