import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import {
  hasStockDisplayBytes,
  putStockDisplayBytes,
  resizePhotoForDisplay,
  stockDisplayCacheSize,
} from "./photoImageResize";

// The mobile deck streams every image at this width (DISPLAY_PHOTO_MAX_WIDTH on
// the client). Warm the same key so the first viewer of a stock card hits the
// pinned cache instead of a multi-MB DB read + sharp resize.
const WARM_WIDTH = 960;

// Deliberately gentle: one row at a time, with a short yield between rows, and
// only after a startup grace period. On the dev remote-DB setup each stock row
// is a multi-MB read — warming several at once (or right at boot) contended
// with live image requests and briefly blanked the whole UI. Sequential + a
// per-row delay keeps at most one extra DB read in flight so live traffic is
// never starved; on Render (colocated DB) the whole warm still finishes fast.
const WARM_CONCURRENCY = 1;
const WARM_ROW_DELAY_MS = 40;
const WARM_START_DELAY_MS = 5_000;

// Recent real-user uploads (non-stock) are warmed after the stock pool so the
// first non-stock cards a user sees also stream from memory. Kept to a bounded
// newest-N window so memory stays predictable (~150 multi-hundred-KB display
// buffers), and started only after the stock warm finishes so the two passes
// never stack DB reads on the remote-DB dev setup.
const RECENT_WARM_LIMIT = 150;
const RECENT_WARM_GAP_MS = 2_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let started = false;

type StockRow = { id: string; mime_type: string; bytes_base64: string };

async function warmOne(row: StockRow): Promise<void> {
  if (hasStockDisplayBytes(row.id, WARM_WIDTH)) return;
  const mime = String(row.mime_type ?? "image/jpeg");
  const b64 = String(row.bytes_base64 ?? "");
  if (!b64) return;
  const buf = Buffer.from(b64, "base64");
  const resized = await resizePhotoForDisplay(buf, mime, WARM_WIDTH);
  putStockDisplayBytes(row.id, WARM_WIDTH, resized.buf, resized.mime);
}

// Gentle sequential warm: one row at a time with a per-row yield so background
// warming never starves live image requests on the remote-DB dev setup.
async function warmList(list: StockRow[], label: string): Promise<number> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < list.length) {
      const row = list[cursor++]!;
      try {
        await warmOne(row);
      } catch (err) {
        logger.warn({ err, id: row.id }, `${label}: row failed`);
      }
      if (WARM_ROW_DELAY_MS > 0) await sleep(WARM_ROW_DELAY_MS);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(WARM_CONCURRENCY, list.length) }, () =>
      worker(),
    ),
  );
  return list.length;
}

// Pin display bytes for the most recent active non-stock uploads so the first
// real-user cards in the deck stream from memory on first sight. Bounded to the
// newest RECENT_WARM_LIMIT rows to cap memory. Runs after the stock warm.
async function warmRecentUploads(): Promise<void> {
  const startedAt = Date.now();
  try {
    const rows = await db.execute(sql`
      SELECT id::text AS id, mime_type, bytes_base64
      FROM photos
      WHERE id NOT LIKE 'stock_%'
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC
      LIMIT ${RECENT_WARM_LIMIT}
    `);
    const list = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      mime_type: String(r.mime_type ?? "image/jpeg"),
      bytes_base64: String(r.bytes_base64 ?? ""),
    }));
    const count = await warmList(list, "recent upload display warm");
    logger.info(
      {
        recentRows: count,
        pinned: stockDisplayCacheSize(),
        ms: Date.now() - startedAt,
      },
      "recent upload display cache warmed",
    );
  } catch (err) {
    logger.error({ err }, "recent upload display cache warm failed");
  }
}

/**
 * Pre-resize the curated stock pool into the pinned display cache. Stock ids
 * are deterministic (`stock_*`), permanent, and shared by every user, so a
 * one-time warm at boot removes the per-card resize stall for the bulk of the
 * matching deck. Runs in the background — failures are logged, never fatal.
 */
export function warmStockDisplayCache(): void {
  if (started) return;
  started = true;

  void (async () => {
    // Let the server settle and serve any reconnect burst before we add
    // background DB reads.
    await sleep(WARM_START_DELAY_MS);
    const startedAt = Date.now();
    try {
      const rows = await db.execute(sql`
        SELECT id::text AS id, mime_type, bytes_base64
        FROM photos
        WHERE id LIKE 'stock_%'
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
      `);
      const list = (rows.rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        mime_type: String(r.mime_type ?? "image/jpeg"),
        bytes_base64: String(r.bytes_base64 ?? ""),
      }));

      await warmList(list, "stock display warm");

      logger.info(
        {
          stockRows: list.length,
          pinned: stockDisplayCacheSize(),
          ms: Date.now() - startedAt,
        },
        "stock display cache warmed",
      );
    } catch (err) {
      logger.error({ err }, "stock display cache warm failed");
    }

    // Chain the recent-upload warm after the stock pool so the two passes never
    // stack background DB reads. A short gap lets any post-stock-warm request
    // burst drain first.
    await sleep(RECENT_WARM_GAP_MS);
    await warmRecentUploads();
  })();
}
