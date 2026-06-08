import { and, isNotNull, lte } from "drizzle-orm";
import { db, photosTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Hard-delete photos whose `expires_at` has passed. Echoes, votes, reports,
 * and seen-photo rows cascade via FK. Pro rows keep `expires_at = null` and
 * are never selected here.
 */
export async function purgeExpiredPhotos(): Promise<number> {
  const deleted = await db
    .delete(photosTable)
    .where(
      and(
        isNotNull(photosTable.expiresAt),
        lte(photosTable.expiresAt, new Date()),
      ),
    )
    .returning({ id: photosTable.id });

  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "purged expired photos");
  }

  return deleted.length;
}
