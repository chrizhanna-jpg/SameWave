/**
 * Unit checks for durable local photo persistence paths and URI resolution.
 * Run: pnpm exec tsx scripts/test-local-photo-persistence.ts
 */

process.env.EXPO_PUBLIC_IMAGE_LOAD_V2 = "true";
process.env.EXPO_PUBLIC_IMAGE_PERSISTENCE_V2 = "true";
process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY =
  "file:///data/user/0/com.samewave.app/files/";
process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";

import {
  isEphemeralLocalCaptureUri,
  isPersistentPhotoUri,
  myPhotosDirForDocumentRoot,
  persistentPhotoUriForLocalId,
} from "../utils/localPhotoPaths";
import {
  resolvePersistedCaptureUri,
  setDocumentDirectoryForTests,
} from "../utils/myPhotoLocalUri";
import type { MyPhoto } from "../context/AppContext";

function shouldPersistRemoteUriForTest(uri: string | undefined): boolean {
  if (!uri?.trim()) return false;
  const u = uri.trim();
  if (u.startsWith("data:")) return false;
  if (isPersistentPhotoUri(u)) return true;
  return u.startsWith("http://") || u.startsWith("https://");
}

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const docDir = process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY!;
setDocumentDirectoryForTests(docDir);

const localId = "11111111-1111-4111-8111-111111111111";
const fullUri = persistentPhotoUriForLocalId(docDir, localId, "full");
const thumbUri = persistentPhotoUriForLocalId(docDir, localId, "thumb");

assert("full persistent uri includes my-photos dir", fullUri.includes("/my-photos/"));
assert("thumb persistent uri ends with -thumb.jpg", thumbUri.endsWith("-thumb.jpg"));
assert(
  "isPersistentPhotoUri true for durable copy",
  isPersistentPhotoUri(fullUri),
);
assert(
  "isEphemeralLocalCaptureUri true for cache capture",
  isEphemeralLocalCaptureUri("file:///cache/ImagePicker/photo.jpg"),
);
assert(
  "isEphemeralLocalCaptureUri false for durable copy",
  !isEphemeralLocalCaptureUri(fullUri),
);
assert(
  "shouldPersistRemoteUri keeps durable file uri",
  shouldPersistRemoteUriForTest(fullUri),
);
assert(
  "shouldPersistRemoteUri strips ephemeral file uri",
  !shouldPersistRemoteUriForTest("file:///cache/photo.jpg"),
);

const strippedPending: MyPhoto = {
  uri: "",
  localId,
  uploadedAt: "2026-07-04T10:00:00.000Z",
  theme: "joy",
  uploadState: "pending",
};

assert(
  "display uri from localId when uri stripped",
  resolvePersistedCaptureUri(strippedPending, "full") === fullUri,
  resolvePersistedCaptureUri(strippedPending, "full"),
);
assert(
  "thumbnail uri from localId when uri stripped",
  resolvePersistedCaptureUri(strippedPending, "thumb") === thumbUri,
  resolvePersistedCaptureUri(strippedPending, "thumb"),
);

const withBackend: MyPhoto = {
  uri: "",
  localId,
  uploadedAt: "2026-07-04T10:00:00.000Z",
  theme: "joy",
  backendId: "server-photo-id",
  uploadState: "ok",
};

assert(
  "persistent path available when backend id also present",
  resolvePersistedCaptureUri(withBackend, "full") === fullUri,
  resolvePersistedCaptureUri(withBackend, "full"),
);

const dir = myPhotosDirForDocumentRoot(docDir);
assert("myPhotosDir ends with subdir", dir.endsWith("my-photos/"));

console.log("Done. exitCode=", process.exitCode ?? 0);
