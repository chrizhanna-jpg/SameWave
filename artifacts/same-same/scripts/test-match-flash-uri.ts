/**
 * MatchFlash must show the swipe-time local capture, not a blank server stream.
 * Mirrors pickMatchMyPhotoDisplayUri / flash resolver logic inline (no RN imports).
 * Run: pnpm exec tsx scripts/test-match-flash-uri.ts
 */
process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";
process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY =
  "file:///data/user/0/com.samewave.app/files/";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function serverPhotoImageUrl(photoId: string, maxWidth = 960): string {
  const base = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  return `${base}/api/photos/${encodeURIComponent(photoId)}/image?w=${maxWidth}`;
}

function isPersistentPhotoUri(uri: string): boolean {
  const doc = process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY ?? "";
  return uri.startsWith(doc) && uri.includes("/my-photos/");
}

function photoUriMatchesVoterId(uri: string, voterId: string): boolean {
  const trimmed = uri.trim();
  const id = voterId.trim();
  if (!trimmed || !id) return false;
  const m = trimmed.match(/\/api\/photos\/([^/?#]+)\/image/);
  if (m?.[1] === id) return true;
  return true; // offline captures match when voter id is today's upload
}

type MyPhoto = {
  uri: string;
  uploadedAt: string;
  backendId?: string;
  localId?: string;
};

/** Local-first pick — preferUri must win over library server stream. */
function pickMatchMyPhotoDisplayUri(
  preferUri: string,
  voterId: string,
  library: MyPhoto[],
): string {
  const hint = preferUri.trim();
  if (
    hint &&
    (isPersistentPhotoUri(hint) ||
      hint.startsWith("file:") ||
      !hint.includes("/api/photos/"))
  ) {
    if (!voterId || photoUriMatchesVoterId(hint, voterId)) return hint;
  }
  const row = library[0];
  if (row) {
    if (isPersistentPhotoUri(row.uri)) return row.uri;
    const bid = row.backendId?.trim();
    if (bid) return serverPhotoImageUrl(bid);
  }
  return voterId ? serverPhotoImageUrl(voterId) : hint;
}

function resolveMatchMyPhotoFlashUri(
  storedMyPhoto: string,
  voterId: string,
  library: MyPhoto[],
): string {
  const stored = storedMyPhoto.trim();
  if (
    stored &&
    (isPersistentPhotoUri(stored) || stored.startsWith("file:")) &&
    photoUriMatchesVoterId(stored, voterId)
  ) {
    return stored;
  }
  const row = library[0];
  if (row && isPersistentPhotoUri(row.uri)) return row.uri;
  return serverPhotoImageUrl(voterId);
}

function resolveMatchMyPhotoFlashFallbackUri(
  primary: string,
  voterId: string,
): string | undefined {
  const server = serverPhotoImageUrl(voterId, 480);
  return server !== primary ? server : undefined;
}

const localId = "44444444-4444-4444-8444-444444444444";
const persistent = `${process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY}my-photos/${localId}-full.jpg`;
const swipeCapture = `file:///cache/capture-${localId}.jpg`;
const voterId = "uploaded-photo-id";

const library: MyPhoto[] = [
  {
    uri: persistent,
    localId,
    backendId: voterId,
    uploadedAt: "2026-07-05T12:00:00.000Z",
  },
];

const snapshotted = pickMatchMyPhotoDisplayUri(swipeCapture, voterId, library);
assert(
  "pickMatchMyPhotoDisplayUri keeps swipe-time file capture",
  snapshotted === swipeCapture,
  snapshotted,
);

const flashUri = resolveMatchMyPhotoFlashUri(persistent, voterId, library);
assert(
  "flash primary prefers stored persistent capture",
  flashUri === persistent,
  flashUri,
);

const flashFallback = resolveMatchMyPhotoFlashFallbackUri(flashUri, voterId);
assert(
  "flash fallback is authed server stream",
  flashFallback?.includes("/api/photos/uploaded-photo-id/image") === true,
  flashFallback,
);
assert(
  "flash fallback differs from primary",
  !!flashFallback && flashFallback !== flashUri,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
