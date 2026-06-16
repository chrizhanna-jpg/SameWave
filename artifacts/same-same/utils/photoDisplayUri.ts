import type { MyPhoto } from "@/context/AppContext";
import { getPublicApiOrigin } from "@/utils/publicEnv";

/** Authenticated stream URL for a server photo row. */
export function serverPhotoImageUrl(photoId: string): string {
  const id = photoId.trim();
  if (!id) return "";
  const base = getPublicApiOrigin().replace(/\/$/, "");
  return `${base}/api/photos/${encodeURIComponent(id)}/image`;
}

/**
 * Prefer the durable server image when we have a backend id — local
 * `file://` captures can be purged after the app sits in background.
 */
export function resolveMyPhotoDisplayUri(photo: Pick<MyPhoto, "uri" | "backendId">): string {
  const bid = photo.backendId?.trim();
  if (bid) return serverPhotoImageUrl(bid);
  return photo.uri?.trim() ?? "";
}

/** Backfill persisted rows that stripped `file://` but kept backendId. */
export function hydrateMyPhotoUri(photo: MyPhoto): MyPhoto {
  const bid = photo.backendId?.trim();
  if (!bid) return photo;
  const server = serverPhotoImageUrl(bid);
  const local = photo.uri?.trim() ?? "";
  if (!local || local.startsWith("file:")) {
    return { ...photo, uri: server };
  }
  return photo;
}
