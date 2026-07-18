import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

import {
  FEED_THUMB_WIDTH,
  isImagePersistenceEnabled,
  UPLOAD_THUMB_JPEG_QUALITY,
} from "@/constants/imageLoading";
import { recordImageTelemetry } from "@/utils/imageLoadTelemetry";
import {
  isEphemeralLocalCaptureUri,
  isPersistentPhotoUri,
  myPhotosDirForDocumentRoot,
  persistentPhotoUriForLocalId,
} from "@/utils/localPhotoPaths";

export {
  isEphemeralLocalCaptureUri,
  isPersistentPhotoUri,
  persistentPhotoUriForLocalId,
} from "@/utils/localPhotoPaths";

export function getDocumentDirectory(): string {
  return FileSystem.documentDirectory ?? "";
}

/** Minimum bytes for a valid JPEG on disk — guards zero-length writes. */
export const MIN_PHOTO_BYTES = 512;

export async function validatePhotoBlob(uri: string): Promise<boolean> {
  const trimmed = uri.trim();
  if (!trimmed) return false;
  try {
    const info = await FileSystem.getInfoAsync(trimmed);
    if (!info.exists || info.isDirectory) return false;
    if ("size" in info && typeof info.size === "number" && info.size < MIN_PHOTO_BYTES) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export type PersistLocalPhotoResult = {
  fullUri: string;
  thumbUri?: string;
};

/**
 * Copy an ephemeral capture into `documentDirectory/my-photos/` and generate
 * a feed thumbnail beside it. Returns null when persistence is disabled or fails.
 */
export async function persistLocalPhotoCapture(
  sourceUri: string,
  localId: string,
): Promise<PersistLocalPhotoResult | null> {
  if (!isImagePersistenceEnabled()) return null;
  const source = sourceUri.trim();
  const id = localId.trim();
  if (!source || !id) return null;
  if (
    !source.startsWith("file:") &&
    !source.startsWith("content:")
  ) {
    return null;
  }
  if (isPersistentPhotoUri(source)) {
    return { fullUri: source };
  }

  const docDir = getDocumentDirectory();
  if (!docDir) return null;
  const photoDir = myPhotosDirForDocumentRoot(docDir);
  const fullUri = persistentPhotoUriForLocalId(docDir, id, "full");
  const thumbUri = persistentPhotoUriForLocalId(docDir, id, "thumb");
  if (!fullUri) return null;

  try {
    await FileSystem.makeDirectoryAsync(photoDir, { intermediates: true });
    await FileSystem.copyAsync({ from: source, to: fullUri });
    if (!(await validatePhotoBlob(fullUri))) {
      await FileSystem.deleteAsync(fullUri, { idempotent: true });
      recordImageTelemetry("img_error", `persist:zero:${id}`);
      return null;
    }

    let thumbOk: string | undefined;
    try {
      const out = await ImageManipulator.manipulateAsync(
        fullUri,
        [{ resize: { width: FEED_THUMB_WIDTH } }],
        {
          compress: UPLOAD_THUMB_JPEG_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        },
      );
      const resized = out.uri?.trim() ?? "";
      if (resized) {
        await FileSystem.copyAsync({ from: resized, to: thumbUri });
        if (await validatePhotoBlob(thumbUri)) {
          thumbOk = thumbUri;
        } else {
          await FileSystem.deleteAsync(thumbUri, { idempotent: true });
          recordImageTelemetry("img_error", `persist:thumb-zero:${id}`);
        }
      }
    } catch {
      recordImageTelemetry("img_error", `persist:thumb-fail:${id}`);
    }

    recordImageTelemetry("img_cache_hit", `persist:ok:${id}`);
    return { fullUri, thumbUri: thumbOk };
  } catch {
    recordImageTelemetry("img_error", `persist:fail:${id}`);
    return null;
  }
}

/** Resolve the best local path for upload/read — persistent copy wins over cache. */
export async function resolveCaptureSourceUri(
  localUri: string,
  localId?: string,
): Promise<string> {
  const primary = localUri.trim();
  if (primary && (await validatePhotoBlob(primary))) return primary;
  const id = localId?.trim();
  if (!id || !isImagePersistenceEnabled()) return primary;
  const persistent = persistentPhotoUriForLocalId(getDocumentDirectory(), id, "full");
  if (persistent && (await validatePhotoBlob(persistent))) return persistent;
  return primary;
}
