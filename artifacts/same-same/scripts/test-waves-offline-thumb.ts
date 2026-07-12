/**
 * Waves feed must prefer on-device library thumbnails over authed streams.
 * Mirrors photoDisplayUri logic inline (RN import chain blocks direct import).
 * Run: pnpm exec tsx scripts/test-waves-offline-thumb.ts
 */

process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";
process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY =
  "file:///data/user/0/com.samewave.app/files/";

function persistentUriForPhoto(
  photo: { localId?: string },
  kind: "full" | "thumb",
): string {
  const id = photo.localId?.trim();
  if (!id) return "";
  const dir = process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY ?? "";
  return `${dir}my-photos/${id}${kind === "thumb" ? "-thumb" : ""}.jpg`;
}

function resolveMyPhotoOfflineThumbnailUri(photo: {
  uri?: string;
  localId?: string;
}): string {
  const persistentThumb = persistentUriForPhoto(photo, "thumb");
  if (persistentThumb) return persistentThumb;
  const local = photo.uri?.trim() ?? "";
  if (local.startsWith("file:") || local.startsWith("content:")) return local;
  const persistentFull = persistentUriForPhoto(photo, "full");
  if (persistentFull) return persistentFull;
  return "";
}

function serverPhotoImageUrl(id: string, w = 320): string {
  const base = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  return `${base}/api/photos/${encodeURIComponent(id)}/image?w=${w}`;
}

function resolveMatchMyPhotoThumbnailUriMirror(
  row: { uri: string; localId?: string; backendId?: string },
): string {
  const offline = resolveMyPhotoOfflineThumbnailUri(row);
  if (offline.trim()) return offline;
  const bid = row.backendId?.trim();
  if (bid) return serverPhotoImageUrl(bid);
  return row.uri;
}

function resolveMatchMyPhotoFallbackUriMirror(
  row: { uri: string; localId?: string; backendId?: string },
): string | undefined {
  const offline = resolveMyPhotoOfflineThumbnailUri(row);
  const primary = resolveMatchMyPhotoThumbnailUriMirror(row);
  const server = row.backendId ? serverPhotoImageUrl(row.backendId) : "";
  if (offline.trim() && primary.startsWith("file:")) return server;
  if (offline.trim() && primary !== offline) return offline;
  return server || undefined;
}

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const oldPhoto = {
  uri: "https://samewave.onrender.com/api/photos/photo-old/image?w=960",
  backendId: "photo-old",
  localId: "local-old",
};

const offline = resolveMyPhotoOfflineThumbnailUri(oldPhoto);
assert(
  "offline thumb uses persistent path when localId present",
  offline.includes("local-old"),
  offline,
);

const thumb = resolveMatchMyPhotoThumbnailUriMirror(oldPhoto);
assert(
  "waves thumb prefers offline library path over server stream",
  thumb.startsWith("file:"),
  thumb,
);

const fallback = resolveMatchMyPhotoFallbackUriMirror(oldPhoto);
assert(
  "fallback is server stream when primary is local",
  fallback?.includes("/api/photos/photo-old/image"),
  fallback,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
