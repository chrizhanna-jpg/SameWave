import {
  authedImageHeaders,
  explorePhotoUriNeedsAuth,
} from "@/utils/api";
import {
  getStoredEtag,
  setStoredEtag,
} from "@/utils/imageLoadCache";
import { recordImageTelemetry } from "@/utils/imageLoadTelemetry";
import { IMAGE_LOAD_V2 } from "@/constants/imageLoading";

export type ValidationResult = "unchanged" | "updated" | "skipped" | "error";

/**
 * Background conditional GET for user thumbnails. Validates freshness without
 * blocking UI — a 304 means bytes on disk are still current.
 */
export async function validateUserPhotoInBackground(
  uri: string,
): Promise<ValidationResult> {
  if (!IMAGE_LOAD_V2) return "skipped";
  const normalized = uri.trim();
  if (!normalized || !explorePhotoUriNeedsAuth(normalized)) {
    return "skipped";
  }
  try {
    const headers = await authedImageHeaders();
    const etag = getStoredEtag(normalized);
    if (etag) headers["If-None-Match"] = etag;
    const started = Date.now();
    const res = await fetch(normalized, {
      method: "GET",
      headers,
    });
    const ms = Date.now() - started;
    if (res.status === 304) {
      recordImageTelemetry("img_conditional_304", normalized, { ms });
      return "unchanged";
    }
    const newEtag = res.headers.get("etag")?.trim();
    if (newEtag) setStoredEtag(normalized, newEtag);
    if (res.ok) {
      recordImageTelemetry("img_user_revalidated", normalized, { ms });
      return "updated";
    }
    recordImageTelemetry("img_error", normalized, { ms });
    return "error";
  } catch {
    recordImageTelemetry("img_error", normalized);
    return "error";
  }
}
