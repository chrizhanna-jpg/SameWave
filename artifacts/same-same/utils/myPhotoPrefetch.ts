import type { Match, MyPhoto } from "@/context/AppContext";
import { prefetchPhotoUris } from "@/utils/imageLoadCache";
import { warmAuthedImageHeaders } from "@/utils/api";
import {
  resolveMatchMyPhotoThumbnailUri,
  resolveMyPhotoThumbnailUri,
} from "@/utils/photoDisplayUri";

/** Bearer-backed streams need a warm token before thumbnail paint. */
export function prefetchMyPhotoLibrary(photos: MyPhoto[], max = 8): void {
  const uris = photos
    .slice(0, max)
    .map((p) => resolveMyPhotoThumbnailUri(p))
    .filter((u) => u.trim().length > 0);
  if (uris.length === 0) return;
  warmAuthedImageHeaders();
  prefetchPhotoUris(uris, { max: uris.length, priority: "hero" });
}

/** Warm voter thumbnails for Waves / sent-ripple rows. */
export function prefetchMatchMyPhotoThumbs(
  matches: Match[],
  myPhotos: MyPhoto[],
  max = 16,
): void {
  const uris = matches
    .slice(0, max)
    .map((m) => resolveMatchMyPhotoThumbnailUri(m, myPhotos))
    .filter((u) => u.trim().length > 0);
  if (uris.length === 0) return;
  warmAuthedImageHeaders();
  prefetchPhotoUris(uris, { max: uris.length, priority: "thumbnail" });
}
