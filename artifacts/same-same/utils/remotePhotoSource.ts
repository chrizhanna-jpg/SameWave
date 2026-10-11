import {
  canonicalizePhotoStreamUri,
  shouldCanonicalizePhotoStreamUri,
  withDisplayPhotoWidth,
} from "@/utils/photoDisplayUri";
import { normalizeUnsplashUri } from "@/utils/unsplashUri";
import { HERO_DISPLAY_WIDTH } from "@/constants/imageLoading";

/**
 * The exact URI an image view requests for a photo. Anything that warms the
 * image cache must use this same function: a prefetch of a URL that differs
 * even by a query parameter never serves the card.
 */
export function normalizeRemotePhotoUri(
  uri: string | null | undefined,
  displayWidth?: number,
): string {
  const trimmed = typeof uri === "string" ? uri.trim() : "";
  if (!trimmed) return "";
  const stream = shouldCanonicalizePhotoStreamUri(trimmed)
    ? canonicalizePhotoStreamUri(trimmed)
    : trimmed;
  const w = displayWidth && displayWidth > 0 ? displayWidth : undefined;
  return withDisplayPhotoWidth(normalizeUnsplashUri(stream), w ?? undefined);
}

/** Source URI of a Ripple deck card's candidate photo. */
export function deckImageUri(uri: string | null | undefined): string {
  return normalizeRemotePhotoUri(uri, HERO_DISPLAY_WIDTH);
}
