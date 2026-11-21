import { inArray } from "drizzle-orm";
import { db, photosTable } from "@workspace/db";
import { logger } from "./logger";
import { getPhotoObject } from "./r2PhotoStore";
import { isStockPhotoCdnEligible } from "./stockPhotoCdn";

/**
 * Deck display/preview columns are written at upload time. A boot-time
 * backfill used to SELECT bytes_base64 (and filter with length(bytes_base64),
 * which detoasts the original) for every user photo still missing those
 * columns. Render free-plan cold starts repeat that scan after every sleep
 * and it exhausted Neon's egress cap. Rows without a display image are
 * loaded lazily by the image and echo routes, which read display_bytes_base64
 * and fall back to the original only when that column is NULL.
 */

/** Load deck previews for candidate ids (user uploads only). */
export async function fetchDeckPreviewsByIds(
  ids: string[],
): Promise<Map<string, { previewUri: string }>> {
  const out = new Map<string, { previewUri: string }>();
  const need = ids.filter((id) => id && !isStockPhotoCdnEligible(id));
  if (need.length === 0) return out;

  const rows = await db
    .select({
      id: photosTable.id,
      previewB64: photosTable.deckPreviewBase64,
      previewMime: photosTable.deckPreviewMime,
      deckPreviewKey: photosTable.deckPreviewKey,
    })
    .from(photosTable)
    .where(inArray(photosTable.id, need));

  const fromR2: Array<{ id: string; key: string; mime: string }> = [];
  for (const row of rows) {
    const b64 = row.previewB64?.trim();
    const mime = row.previewMime?.trim() || "image/jpeg";
    if (b64) {
      // The Ripple deck only paints previewUri when it starts with "data:".
      out.set(row.id, { previewUri: `data:${mime};base64,${b64}` });
      continue;
    }
    const key = row.deckPreviewKey?.trim();
    if (key) fromR2.push({ id: row.id, key, mime });
  }

  const workers = Math.min(8, fromR2.length);
  let cursor = 0;
  async function pull(): Promise<void> {
    while (cursor < fromR2.length) {
      const item = fromR2[cursor];
      cursor += 1;
      if (!item) return;
      try {
        const obj = await getPhotoObject(item.key);
        if (!obj) continue;
        const mime = item.mime.startsWith("image/")
          ? item.mime
          : obj.contentType.startsWith("image/")
            ? obj.contentType
            : "image/jpeg";
        out.set(item.id, {
          previewUri: `data:${mime};base64,${obj.body.toString("base64")}`,
        });
      } catch (err) {
        logger.warn({ err, photoId: item.id }, "deck preview object read failed");
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => pull()));
  return out;
}
