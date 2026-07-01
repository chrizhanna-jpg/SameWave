import { sql, eq, inArray } from "drizzle-orm";
import { db, photosTable } from "@workspace/db";
import { logger } from "./logger";
import {
  DECK_DISPLAY_WIDTH,
  encodeDeckPhotoSizes,
} from "./photoDisplayEncode";
import { putCachedDisplayBytes } from "./photoImageResize";
import { isStockPhotoCdnEligible } from "./stockPhotoCdn";

const BACKFILL_BATCH = 80;
const BACKFILL_CONCURRENCY = 2;
const BACKFILL_BATCH_GAP_MS = 3_000;
const BACKFILL_MAX_BATCHES_PER_BOOT = 40;

let backfillStarted = false;

async function fetchBackfillBatch(): Promise<
  Array<{ id: string; mime_type: string; bytes_base64: string }>
> {
  const rows = await db.execute(sql`
    SELECT id::text AS id, mime_type, bytes_base64
    FROM photos
    WHERE id NOT LIKE 'stock_%'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
      AND (display_bytes_base64 IS NULL OR deck_preview_base64 IS NULL)
      AND length(bytes_base64) > 0
    ORDER BY created_at DESC
    LIMIT ${BACKFILL_BATCH}
  `);
  return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    mime_type: String(r.mime_type ?? "image/jpeg"),
    bytes_base64: String(r.bytes_base64 ?? ""),
  }));
}

async function warmBatch(
  list: Array<{ id: string; mime_type: string; bytes_base64: string }>,
): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
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
}

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
 * Background pass: encode deck display + preview columns for every active
 * user upload that predates the column (or failed upload-time encode).
 * Runs in gentle batches until the queue is empty or a per-boot cap is hit
 * so a large backlog cannot starve live matching traffic.
 */
export function startDeckEncodeBackfill(): void {
  if (backfillStarted) return;
  backfillStarted = true;

  void (async () => {
    await new Promise((r) => setTimeout(r, 8_000));
    const startedAt = Date.now();
    let total = 0;
    try {
      for (let batch = 0; batch < BACKFILL_MAX_BATCHES_PER_BOOT; batch++) {
        const list = await fetchBackfillBatch();
        if (list.length === 0) break;
        await warmBatch(list);
        total += list.length;
        if (list.length < BACKFILL_BATCH) break;
        if (BACKFILL_BATCH_GAP_MS > 0) {
          await new Promise((r) => setTimeout(r, BACKFILL_BATCH_GAP_MS));
        }
      }
      if (total > 0) {
        logger.info(
          { rows: total, ms: Date.now() - startedAt },
          "deck encode backfill finished",
        );
      }
    } catch (err) {
      logger.error({ err, rowsDone: total }, "deck encode backfill failed");
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
