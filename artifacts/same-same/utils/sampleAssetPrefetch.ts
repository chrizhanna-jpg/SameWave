import AsyncStorage from "@react-native-async-storage/async-storage";
import { SAMPLE_PHOTOS } from "@/data/samplePhotos";
import { HERO_DISPLAY_WIDTH } from "@/constants/imageLoading";
import { normalizeUnsplashUri } from "@/utils/unsplashUri";
import { photoKey } from "@/utils/photoKey";
import { prefetchPhotoUris } from "@/utils/imageLoadCache";
import { recordImageTelemetry } from "@/utils/imageLoadTelemetry";

const FIRST_RUN_KEY = "samesame_sample_prefetch_done_v1";

/** Critical sample deck images to warm on cold start (first N unique). */
export const SAMPLE_COLD_START_PREFETCH_COUNT = 12;

/** Smaller batch on subsequent launches — keeps samples hot without saturating network. */
export const SAMPLE_WARM_PREFETCH_COUNT = 6;

/** Sample assets are static Unsplash CDN URLs — equivalent to `/static/samples/` hosting. */
export const SAMPLE_ASSET_HOST = "https://images.unsplash.com";

function sampleUriAtWidth(uri: string, width: number): string {
  try {
    const url = new URL(uri);
    url.searchParams.set("w", String(Math.round(width)));
    if (!url.searchParams.has("auto")) url.searchParams.set("auto", "format");
    if (!url.searchParams.has("fit")) url.searchParams.set("fit", "crop");
    if (!url.searchParams.has("q")) url.searchParams.set("q", "80");
    return url.toString();
  } catch {
    return normalizeUnsplashUri(uri);
  }
}

/** Unique hero-width URIs for the curated sample deck. */
export function criticalSampleUris(max = SAMPLE_COLD_START_PREFETCH_COUNT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of SAMPLE_PHOTOS) {
    const atWidth = sampleUriAtWidth(p.uri, HERO_DISPLAY_WIDTH);
    const key = photoKey(atWidth);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(atWidth);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Prefetch sample assets on app launch. Unsplash CDN serves with aggressive
 * edge caching; expo-image disk cache makes repeat views sub-200ms.
 */
export async function prefetchSampleAssetsOnColdStart(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(FIRST_RUN_KEY);
    const count = done ? SAMPLE_WARM_PREFETCH_COUNT : SAMPLE_COLD_START_PREFETCH_COUNT;
    const uris = criticalSampleUris(count);
    recordImageTelemetry("img_sample_prefetch_batch", `count:${uris.length}`);
    prefetchPhotoUris(uris, { max: uris.length, priority: "prefetch" });
    if (!done) await AsyncStorage.setItem(FIRST_RUN_KEY, "1");
  } catch {
    /* best-effort */
  }
}
