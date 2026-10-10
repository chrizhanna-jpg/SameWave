import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

let ensured = false;

/** Additive columns for whispers, view counts, and Wave keep / share. */
export async function ensureUxWaveSchema(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql`
      ALTER TABLE photos ADD COLUMN IF NOT EXISTS whisper varchar(60)
    `);
    await db.execute(sql`
      ALTER TABLE photos ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE echoes ADD COLUMN IF NOT EXISTS wave_name varchar(80)
    `);
    await db.execute(sql`
      ALTER TABLE echoes ADD COLUMN IF NOT EXISTS kept_low boolean NOT NULL DEFAULT false
    `);
    await db.execute(sql`
      ALTER TABLE echoes ADD COLUMN IF NOT EXISTS kept_high boolean NOT NULL DEFAULT false
    `);
    await db.execute(sql`
      ALTER TABLE echoes ADD COLUMN IF NOT EXISTS share_low boolean NOT NULL DEFAULT false
    `);
    await db.execute(sql`
      ALTER TABLE echoes ADD COLUMN IF NOT EXISTS share_high boolean NOT NULL DEFAULT false
    `);
    ensured = true;
    logger.info("ux wave schema ensured");
  } catch (err) {
    logger.error({ err }, "ux wave schema ensure failed");
    throw err;
  }
}
