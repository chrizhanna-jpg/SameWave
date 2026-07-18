/** Relative folder under Expo `documentDirectory` for durable user captures. */
export const MY_PHOTOS_SUBDIR = "my-photos/";

export function myPhotosDirForDocumentRoot(documentDirectory: string): string {
  const root = documentDirectory.trim();
  if (!root) return "";
  const normalized = root.endsWith("/") ? root : `${root}/`;
  return `${normalized}${MY_PHOTOS_SUBDIR}`;
}

/** Build a stable on-disk URI for a myPhotos row (`full` or feed `thumb`). */
export function persistentPhotoUriForLocalId(
  documentDirectory: string,
  localId: string,
  kind: "full" | "thumb" = "full",
): string {
  const id = localId.trim();
  const dir = myPhotosDirForDocumentRoot(documentDirectory);
  if (!id || !dir) return "";
  const suffix = kind === "thumb" ? "-thumb.jpg" : ".jpg";
  const path = `${dir}${id}${suffix}`;
  if (path.startsWith("file://") || path.startsWith("content://")) return path;
  return `file://${path}`;
}

/** True when `uri` points at our durable my-photos store (safe to persist). */
export function isPersistentPhotoUri(uri: string): boolean {
  const u = uri.trim();
  if (!u) return false;
  if (!u.includes(`/${MY_PHOTOS_SUBDIR}`) && !u.includes("/my-photos/")) {
    return false;
  }
  return u.startsWith("file:") || u.startsWith("content:");
}

/** Camera roll / cache captures that the OS may purge after backgrounding. */
export function isEphemeralLocalCaptureUri(uri: string): boolean {
  const u = uri.trim();
  if (!u.startsWith("file:") && !u.startsWith("content:")) return false;
  return !isPersistentPhotoUri(u);
}
