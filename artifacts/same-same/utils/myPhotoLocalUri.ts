import { isImagePersistenceEnabled } from "@/constants/imageLoading";
import {
  isPersistentPhotoUri,
  persistentPhotoUriForLocalId,
} from "@/utils/localPhotoPaths";

let cachedDocumentDirectory: string | null = null;

function documentDirectoryForPersistence(): string {
  if (cachedDocumentDirectory !== null) return cachedDocumentDirectory;
  const testDir = process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY?.trim();
  if (testDir) {
    cachedDocumentDirectory = testDir;
    return cachedDocumentDirectory;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
    cachedDocumentDirectory = FS.documentDirectory ?? "";
  } catch {
    cachedDocumentDirectory = "";
  }
  return cachedDocumentDirectory;
}

/** Test hook — pin documentDirectory without loading expo-file-system. */
export function setDocumentDirectoryForTests(dir: string | null): void {
  cachedDocumentDirectory = dir;
}

export function persistentUriForPhoto(
  photo: { localId?: string },
  kind: "full" | "thumb",
): string {
  if (!isImagePersistenceEnabled()) return "";
  const id = photo.localId?.trim();
  if (!id) return "";
  const dir = documentDirectoryForPersistence();
  if (!dir) return "";
  return persistentPhotoUriForLocalId(dir, id, kind);
}

export function resolvePersistedCaptureUri(
  photo: {
    uri?: string;
    localId?: string;
    backendId?: string;
    uploadState?: "pending" | "ok" | "failed";
  },
  kind: "full" | "thumb",
): string {
  const local = photo.uri?.trim() ?? "";
  const bid = photo.backendId?.trim();
  const stillUploading =
    !bid &&
    (photo.uploadState === "pending" ||
      (photo.uploadState !== "ok" && !photo.backendId?.trim()));
  const persistent =
    kind === "thumb"
      ? persistentUriForPhoto(photo, "thumb")
      : persistentUriForPhoto(photo, "full");
  const persistentFull = kind === "full" ? persistent : persistentUriForPhoto(photo, "full");

  if (stillUploading && (local.startsWith("file:") || local.startsWith("content:"))) {
    return kind === "thumb" && persistent ? persistent : local;
  }
  if (local && isPersistentPhotoUri(local)) return local;
  if (persistent) return persistent;
  if (local.startsWith("file:") || local.startsWith("content:")) return local;
  if (persistentFull && kind === "thumb") return persistentFull;
  return local;
}

export { isPersistentPhotoUri } from "@/utils/localPhotoPaths";
