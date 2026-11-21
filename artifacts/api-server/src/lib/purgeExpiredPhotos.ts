import { and, inArray, isNotNull, lte } from "drizzle-orm";
import { db, photosTable } from "@workspace/db";
import { logger } from "./logger";
import { deletePhotoObjects } from "./r2PhotoStore";

/**
 * Hard-delete photos whose `expires_at` has passed. Echoes, votes, reports,
 * and seen-photo rows cascade via FK. Pro rows keep `expires_at = null` and
 * are never selected here.
 */
export async function purgeExpiredPhotos(): Promise<number> {
  const doomed = await db
    .select({
      id: photosTable.id,
      originalKey: photosTable.originalKey,
      displayKey: photosTable.displayKey,
      deckPreviewKey: photosTable.deckPreviewKey,
      audioKey: photosTable.audioKey,
    })
    .from(photosTable)
    .where(
      and(
        isNotNull(photosTable.expiresAt),
        lte(photosTable.expiresAt, new Date()),
      ),
    );
  if (doomed.length === 0) return 0;

  const deleted = await db
    .delete(photosTable)
    .where(
      inArray(
        photosTable.id,
        doomed.map((row) => row.id),
      ),
    )
    .returning({ id: photosTable.id });

  const deletedIds = new Set(deleted.map((row) => row.id));
  const removed = doomed.filter((row) => deletedIds.has(row.id));
  if (removed.length > 0) {
    await deletePhotoObjects(
      removed.flatMap((row) => [
        row.originalKey,
        row.displayKey,
        row.deckPreviewKey,
        row.audioKey,
      ]),
    ).catch((err) => {
      logger.warn({ err, count: removed.length }, "expired photo object delete failed");
    });
    logger.info({ count: removed.length }, "purged expired photos");
  }

  return removed.length;
}
