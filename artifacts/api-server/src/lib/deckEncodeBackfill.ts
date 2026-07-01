import { sql, eq, inArray } from "drizzle-orm";
import { db, photosTable } from "@workspace/db";
import { logger } from "./logger";
import {
  DECK_DISPLAY_WIDTH,
  encodeDeckPhotoSizes,
} from "./photoDisplayEncode";
import { putCachedDisplayBytes } from "./photoImageResize";
import { isStockPhotoCdnEligible } from "./stockPhotoCdn";

const BACKFILL_LIMIT = 200;
const BACKFILL_CONCURRENCY = 2;

let backfillStarted = false;

async function backfillOne(row: {
  id: string;
  mime_type: string;
  bytes_base64: string;
}): Promise<void> {
  if (isStockPhotoCdnEligible(row.id)) return;
  try {
    const encoded = await encodeDeckPhotoSizes(
      row.bytes_base64,
      row.mime_type ?? "image/jpeg",
    );
    await db
      .update(photosTable)
      .set({
        displayBytesBase64: encoded.displayB64,
        displayMime: encoded.displayMime,
        deckPreviewBase64: encoded.previewB64,
        deckPreviewMime: encoded.previewMime,
      })
      .where(eq(photosTable.id, row.id));
    putCachedDisplayBytes(
      row.id,
      DECK_DISPLAY_WIDTH,
      encoded.displayBuf,
      encoded.displayMime,
    );
  } catch (err) {
    logger.warn({ err, id: row.id }, "deck encode backfill row failed");
  }
}

/**
 * Background pass: encode deck display + preview columns for recent uploads
 * that predate the column (or failed upload-time encode). Makes user-upload
 * matching cards instant without waiting for an on-demand cold resize.
 */
export function startDeckEncodeBackfill(): void {
  if (backfillStarted) return;
  backfillStarted = true;

  void (async () => {
    await new Promise((r) => setTimeout(r, 8_000));
    try {
      const rows = await db.execute(sql`
        SELECT id::text AS id, mime_type, bytes_base64
        FROM photos
        WHERE id NOT LIKE 'stock_%'
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
          AND (display_bytes_base64 IS NULL OR deck_preview_base64 IS NULL)
          AND length(bytes_base64) > 0
        ORDER BY created_at DESC
        LIMIT ${BACKFILL_LIMIT}
      `);
      const list = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        mime_type: String(r.mime_type ?? "image/jpeg"),
        bytes_base64: String(r.bytes_base64 ?? ""),
      }));
      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          const row = list[cursor++]!;
          await backfillOne(row);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(BACKFILL_CONCURRENCY, list.length) },
          () => worker(),
        ),
      );
      if (list.length > 0) {
        logger.info({ rows: list.length }, "deck encode backfill finished");
      }
    } catch (err) {
      logger.error({ err }, "deck encode backfill failed");
    }
  })();
}

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
