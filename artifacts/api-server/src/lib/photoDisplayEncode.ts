import { resizePhotoForDisplay } from "./photoImageResize";

/** Matches client DISPLAY_PHOTO_MAX_WIDTH — stored at upload for fast streams. */
export const DECK_DISPLAY_WIDTH = 960;
/** Inline /candidates preview — small enough to embed for every returned row. */
export const DECK_PREVIEW_WIDTH = 480;

export type EncodedDeckSizes = {
  displayB64: string;
  displayMime: string;
  previewB64: string;
  previewMime: string;
  displayBuf: Buffer;
};

/**
 * Encode the two deck sizes we persist at upload time: a 960w stream for
 * GET /photos/:id/image and a 480w preview inlined in /candidates JSON.
 */
export async function encodeDeckPhotoSizes(
  rawB64: string,
  mime: string,
): Promise<EncodedDeckSizes> {
  const buf = Buffer.from(rawB64.replace(/^data:[^;]+;base64,/, ""), "base64");
  const display = await resizePhotoForDisplay(buf, mime, DECK_DISPLAY_WIDTH);
  const preview = await resizePhotoForDisplay(buf, mime, DECK_PREVIEW_WIDTH);
  return {
    displayB64: display.buf.toString("base64"),
    displayMime: display.mime,
    previewB64: preview.buf.toString("base64"),
    previewMime: preview.mime,
    displayBuf: display.buf,
  };
}

export function deckPreviewDataUri(
  previewB64: string | null | undefined,
  previewMime: string | null | undefined,
): string | null {
  const b64 = previewB64?.trim();
  if (!b64) return null;
  const mime = previewMime?.trim() || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}
