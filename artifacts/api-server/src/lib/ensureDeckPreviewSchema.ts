import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

let ensured = false;

/** Idempotent DDL for deck preview columns (safe on every boot). */
export async function ensureDeckPreviewSchema(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql`
      ALTER TABLE photos ADD COLUMN IF NOT EXISTS display_bytes_base64 text
    `);
    await db.execute(sql`
      ALTER TABLE photos ADD COLUMN IF NOT EXISTS display_mime varchar(32)
    `);
    await db.execute(sql`
      ALTER TABLE photos ADD COLUMN IF NOT EXISTS deck_preview_base64 text
    `);
    await db.execute(sql`
      ALTER TABLE photos ADD COLUMN IF NOT EXISTS deck_preview_mime varchar(32)
    `);
    ensured = true;
    logger.info("deck preview schema ensured");
  } catch (err) {
    logger.error({ err }, "deck preview schema ensure failed");
    throw err;
  }
}

export type DeckPreviewSchemaStatus = {
  columnsReady: boolean;
  missingPreviewCount: number;
};

/** Read-only check for /api/public/backend-status. */
export async function getDeckPreviewSchemaStatus(): Promise<DeckPreviewSchemaStatus> {
  try {
    const colRows = await db.execute(sql`
      SELECT count(*)::int AS c
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'photos'
        AND column_name IN (
          'display_bytes_base64',
          'display_mime',
          'deck_preview_base64',
          'deck_preview_mime'
        )
    `);
    const colCount = Number(
      (colRows.rows[0] as Record<string, unknown> | undefined)?.c ?? 0,
    );
    if (colCount < 4) {
      return { columnsReady: false, missingPreviewCount: -1 };
    }
    const missRows = await db.execute(sql`
      SELECT count(*)::int AS c
      FROM photos
      WHERE id NOT LIKE 'stock_%'
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
        AND (display_bytes_base64 IS NULL OR deck_preview_base64 IS NULL)
        AND length(bytes_base64) > 0
    `);
    const missingPreviewCount = Number(
      (missRows.rows[0] as Record<string, unknown> | undefined)?.c ?? 0,
    );
    return { columnsReady: true, missingPreviewCount };
  } catch {
    return { columnsReady: false, missingPreviewCount: -1 };
  }
}
