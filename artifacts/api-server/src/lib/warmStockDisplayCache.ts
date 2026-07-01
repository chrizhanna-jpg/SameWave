import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import {
  hasStockDisplayBytes,
  putStockDisplayBytes,
  resizePhotoForDisplay,
  stockDisplayCacheSize,
} from "./photoImageResize";
import { isStockPhotoCdnEligible } from "./stockPhotoCdn";

// The mobile deck streams every image at this width (DISPLAY_PHOTO_MAX_WIDTH on
// the client). Warm the same key so the first viewer of a stock card hits the
// pinned cache instead of a multi-MB DB read + sharp resize.
export const WARM_DISPLAY_WIDTH = 960;

const isProd = process.env.NODE_ENV === "production";
const WARM_CONCURRENCY = Math.min(
  Math.max(
    parseInt(process.env.WARM_CONCURRENCY ?? "", 10) || (isProd ? 4 : 1),
    1,
  ),
  8,
);
const WARM_ROW_DELAY_MS =
  parseInt(process.env.WARM_ROW_DELAY_MS ?? "", 10) ||
  (isProd ? 0 : 40);
const WARM_START_DELAY_MS =
  parseInt(process.env.WARM_START_DELAY_MS ?? "", 10) ||
  (isProd ? 0 : 5_000);

// Recent real-user uploads (non-stock) are warmed after the stock pool so the
// first non-stock cards a user sees also stream from memory. Kept to a bounded
// newest-N window so memory stays predictable (~150 multi-hundred-KB display
// buffers), and started only after the stock warm finishes so the two passes
// never stack DB reads on the remote-DB dev setup.
const RECENT_WARM_LIMIT = 150;
const RECENT_WARM_GAP_MS = isProd ? 500 : 2_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let started = false;
const priorityIds = new Set<string>();
let priorityDrainRunning = false;

type StockRow = { id: string; mime_type: string; bytes_base64: string };

async function warmOne(row: StockRow): Promise<void> {
  if (isStockPhotoCdnEligible(row.id)) return;
  if (hasStockDisplayBytes(row.id, WARM_DISPLAY_WIDTH)) return;
  const mime = String(row.mime_type ?? "image/jpeg");
  const b64 = String(row.bytes_base64 ?? "");
  if (!b64) return;
  const buf = Buffer.from(b64, "base64");
  const resized = await resizePhotoForDisplay(buf, mime, WARM_DISPLAY_WIDTH);
  putStockDisplayBytes(row.id, WARM_DISPLAY_WIDTH, resized.buf, resized.mime);
}

async function warmOneById(photoId: string): Promise<void> {
  if (isStockPhotoCdnEligible(photoId)) return;
  if (hasStockDisplayBytes(photoId, WARM_DISPLAY_WIDTH)) return;
  const rows = await db.execute(sql`
    SELECT id::text AS id, mime_type, bytes_base64
    FROM photos
    WHERE id::text = ${photoId}
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  `);
  const r = rows.rows[0] as Record<string, unknown> | undefined;
  if (!r) return;
  await warmOne({
    id: String(r.id),
    mime_type: String(r.mime_type ?? "image/jpeg"),
    bytes_base64: String(r.bytes_base64 ?? ""),
  });
}

async function drainPriorityQueue(): Promise<void> {
  if (priorityDrainRunning) return;
  priorityDrainRunning = true;
  try {
    while (priorityIds.size > 0) {
      const id = priorityIds.values().next().value as string;
      priorityIds.delete(id);
      try {
        await warmOneById(id);
      } catch (err) {
        logger.warn({ err, id }, "priority display warm: row failed");
      }
    }
  } finally {
    priorityDrainRunning = false;
    if (priorityIds.size > 0) void drainPriorityQueue();
  }
}

/**
 * Jump the line: warm display bytes for photos about to appear in the deck
 * (from a fresh /candidates response) before the background stock sweep
 * reaches them.
 */
export function prioritizeWarmPhotoIds(ids: string[]): void {
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || id.length > 64) continue;
    if (isStockPhotoCdnEligible(id)) continue;
    if (hasStockDisplayBytes(id, WARM_DISPLAY_WIDTH)) continue;
    priorityIds.add(id);
  }
  void drainPriorityQueue();
}

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
          warmConcurrency: WARM_CONCURRENCY,
          ms: Date.now() - startedAt,
        },
        "stock display cache warmed",
      );
    } catch (err) {
      logger.error({ err }, "stock display cache warm failed");
    }

    await sleep(RECENT_WARM_GAP_MS);
    await warmRecentUploads();
  })();
}
