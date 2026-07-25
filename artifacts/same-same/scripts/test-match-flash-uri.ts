/**
 * MatchFlash / swipe snapshot must keep local display URIs when backendId exists.
 * Run: pnpm exec tsx scripts/test-match-flash-uri.ts
 */

process.env.EXPO_PUBLIC_IMAGE_LOAD_V2 = "true";
process.env.EXPO_PUBLIC_IMAGE_PERSISTENCE_V2 = "true";
process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY =
  "file:///data/user/0/com.samewave.app/files/";
process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";

import {
  isPersistentPhotoUri,
  persistentPhotoUriForLocalId,
} from "../utils/localPhotoPaths";
import {
  resolvePersistedCaptureUri,
  setDocumentDirectoryForTests,
} from "../utils/myPhotoLocalUri";
import type { Match, MyPhoto } from "../context/AppContext";

setDocumentDirectoryForTests(process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY!);

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const localId = "44444444-4444-4444-8444-444444444444";
const persistent = persistentPhotoUriForLocalId(
  process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY!,
  localId,
);

const library: MyPhoto[] = [
  {
    uri: persistent,
    localId,
    backendId: "uploaded-photo-id",
    uploadedAt: "2026-07-05T12:00:00.000Z",
    theme: "joy",
    uploadState: "ok",
  },
];

function pickMatchMyPhotoDisplayUri(
  match: Pick<Match, "myPhoto" | "myPhotoId" | "myPhotoUploadedAt">,
  myPhotos: MyPhoto[],
  preferUri?: string,
): string {
  const row = myPhotos.find(
    (p) => p.uploadedAt === match.myPhotoUploadedAt?.trim(),
  );
  if (row) {
    const fromLib = resolvePersistedCaptureUri(row, "full");
    if (fromLib.trim()) return fromLib;
  }
  const hint = preferUri?.trim() || match.myPhoto?.trim() || "";
  if (
    hint &&
    (isPersistentPhotoUri(hint) ||
      hint.startsWith("file:") ||
      !hint.includes("/api/photos/"))
  ) {
    return hint;
  }
  const bid = match.myPhotoId?.trim();
  return bid
    ? `${process.env.EXPO_PUBLIC_API_URL}/api/photos/${bid}/image`
    : hint;
}

function resolveMyPhotoFallbackUri(photo: MyPhoto): string | undefined {
  const primary = resolvePersistedCaptureUri(photo, "full");
  const bid = photo.backendId?.trim();
  const server = bid
    ? `${process.env.EXPO_PUBLIC_API_URL}/api/photos/${bid}/image`
    : "";
  if (server && server !== primary) return server;
  return undefined;
}

const serverAtSwipe = `${process.env.EXPO_PUBLIC_API_URL}/api/photos/uploaded-photo-id/image`;
const picked = pickMatchMyPhotoDisplayUri(
  {
    myPhoto: serverAtSwipe,
    myPhotoId: "uploaded-photo-id",
    myPhotoUploadedAt: "2026-07-05T12:00:00.000Z",
  },
  library,
  persistent,
);
assert(
  "swipe snapshot prefers persistent local over server stream",
  picked === persistent,
  picked,
);

const row = library[0]!;
const primary = resolvePersistedCaptureUri(row, "full");
const fallback = resolveMyPhotoFallbackUri(row);
assert("flash primary is local file", isPersistentPhotoUri(primary), primary);
assert(
  "flash fallback is server stream",
  fallback?.includes("/api/photos/uploaded-photo-id/image") ?? false,
  fallback ?? "",
);
assert(
  "flash primary and fallback differ",
  Boolean(fallback && fallback !== primary),
);

console.log("Done. exitCode=", process.exitCode ?? 0);
