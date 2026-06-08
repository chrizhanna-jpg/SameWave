import { getPhotoRetentionCleanupIntervalMs } from "./photoRetention";
import { purgeExpiredPhotos } from "./purgeExpiredPhotos";
import { logger } from "./logger";

let timer: ReturnType<typeof setInterval> | null = null;

/** Run purge on an interval for the lifetime of the API process. */
export function startPhotoRetentionCleanup(): void {
  if (timer) return;

  const intervalMs = getPhotoRetentionCleanupIntervalMs();

  const run = () => {
    void purgeExpiredPhotos().catch((err) => {
      logger.error({ err }, "expired-photo purge failed");
    });
  };

  run();
  timer = setInterval(run, intervalMs);
  timer.unref?.();

  logger.info(
    { intervalHours: intervalMs / (60 * 60 * 1000) },
    "photo retention cleanup scheduled",
  );
}
