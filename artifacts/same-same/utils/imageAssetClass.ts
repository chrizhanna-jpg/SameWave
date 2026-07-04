import { isSamplePhoto } from "@/data/samplePhotos";
import { extractPhotoStreamId } from "@/utils/photoDisplayUri";

export type ImageAssetClass = "sample" | "user_upload" | "local" | "unknown";

/** Classify a display URI for cache policy, telemetry, and prefetch. */
export function classifyImageUri(uri: string): ImageAssetClass {
  const trimmed = uri.trim();
  if (!trimmed) return "unknown";
  if (
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:") ||
    trimmed.startsWith("data:")
  ) {
    return "local";
  }
  if (trimmed.includes("images.unsplash.com") || isSamplePhoto(trimmed)) {
    return "sample";
  }
  if (extractPhotoStreamId(trimmed)) {
    return "user_upload";
  }
  if (/\/api\/photos\/[^/]+\/image/.test(trimmed)) {
    return "user_upload";
  }
  return "unknown";
}

export function isSampleAssetUri(uri: string): boolean {
  return classifyImageUri(uri) === "sample";
}

export function isUserUploadUri(uri: string): boolean {
  return classifyImageUri(uri) === "user_upload";
}
