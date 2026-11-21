import { inArray } from "drizzle-orm";
import { db, photosTable } from "@workspace/db";
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
    })
    .from(photosTable)
    .where(inArray(photosTable.id, need));

  for (const row of rows) {
    const b64 = row.previewB64?.trim();
    if (!b64) continue;
    const mime = row.previewMime?.trim() || "image/jpeg";
    out.set(row.id, { previewUri: `data:${mime};base64,${b64}` });
  }
  return out;
}
