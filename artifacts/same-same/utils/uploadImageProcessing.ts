import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import {
  UPLOAD_DISPLAY_WIDTH,
  UPLOAD_JPEG_QUALITY,
  UPLOAD_PREVIEW_JPEG_QUALITY,
  UPLOAD_PREVIEW_WIDTH,
  UPLOAD_THUMB_JPEG_QUALITY,
  UPLOAD_THUMB_WIDTH,
} from "@/constants/imageLoading";

export type PreparedUploadImages = {
  /** Primary payload — resized display (≤960w JPEG). */
  imageBase64: string;
  mimeType: string;
  /** Pre-encoded 960w for server to persist without Sharp. */
  displayBase64: string;
  /** Pre-encoded 480w deck preview for /candidates inline paint. */
  deckPreviewBase64: string;
  /** Optional 240w thumb for future list endpoints. */
  thumbnailBase64?: string;
};

function stripDataPrefix(b64: string): string {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

async function resizeToJpegBase64(
  inputUri: string,
  width: number,
  quality: number,
): Promise<string> {
  const out = await ImageManipulator.manipulateAsync(
    inputUri,
    [{ resize: { width } }],
    {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  const b64 = out.base64?.trim() ?? "";
  if (!b64) throw new Error("resize produced empty base64");
  return stripDataPrefix(b64);
}

/**
 * Write base64 to a temp file so ImageManipulator can chain resizes without
 * re-decoding the full original in JS.
 */
async function writeTempJpeg(dataUriOrB64: string): Promise<string> {
  const dir = FileSystem.cacheDirectory ?? "";
  const path = `${dir}upload-prep-${Date.now()}.jpg`;
  const raw = stripDataPrefix(dataUriOrB64);
  await FileSystem.writeAsStringAsync(path, raw, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

/**
 * Resize and compress on-device before upload so the free server can skip Sharp.
 * Accepts raw base64 or a local file/content URI.
 */
export async function prepareUploadImages(input: {
  base64?: string | null;
  uri?: string | null;
  mimeType?: string;
}): Promise<PreparedUploadImages | null> {
  const mimeType =
    input.mimeType?.startsWith("image/") ? input.mimeType : "image/jpeg";
  let sourceUri = input.uri?.trim() ?? "";
  if (!sourceUri && input.base64?.trim()) {
    try {
      sourceUri = await writeTempJpeg(input.base64);
    } catch {
      return null;
    }
  }
  if (!sourceUri) return null;

  try {
    const [displayBase64, deckPreviewBase64, thumbnailBase64] = await Promise.all([
      resizeToJpegBase64(sourceUri, UPLOAD_DISPLAY_WIDTH, UPLOAD_JPEG_QUALITY),
      resizeToJpegBase64(sourceUri, UPLOAD_PREVIEW_WIDTH, UPLOAD_PREVIEW_JPEG_QUALITY),
      resizeToJpegBase64(sourceUri, UPLOAD_THUMB_WIDTH, UPLOAD_THUMB_JPEG_QUALITY),
    ]);
    return {
      imageBase64: displayBase64,
      mimeType: "image/jpeg",
      displayBase64,
      deckPreviewBase64,
      thumbnailBase64,
    };
  } catch {
    const fallback = input.base64?.trim();
    if (!fallback) return null;
    const stripped = stripDataPrefix(fallback);
    return {
      imageBase64: stripped,
      mimeType,
      displayBase64: stripped,
      deckPreviewBase64: stripped,
    };
  }
}
