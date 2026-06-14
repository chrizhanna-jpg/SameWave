/** Default free-tier photo retention. Override with `PHOTO_RETENTION_DAYS`. */
export const DEFAULT_PHOTO_RETENTION_DAYS = 90;

/**
 * How long free-user photos stay on the server before `expires_at` hides them.
 * Pro users use `expires_at = null` (indefinite). Lower this env var when scale
 * requires shorter retention — no app release needed.
 */
export function getPhotoRetentionDays(): number {
  const raw = process.env.PHOTO_RETENTION_DAYS?.trim();
  if (raw) {
    const days = Number(raw);
    if (Number.isFinite(days) && days > 0) {
      return Math.round(days);
    }
  }
  return DEFAULT_PHOTO_RETENTION_DAYS;
}

export function getPhotoRetentionMs(): number {
  return getPhotoRetentionDays() * 24 * 60 * 60 * 1000;
}

const DEFAULT_CLEANUP_INTERVAL_HOURS = 24;

/** Interval between expired-photo purge runs (`PHOTO_RETENTION_CLEANUP_INTERVAL_HOURS`, default 24). */
export function getPhotoRetentionCleanupIntervalMs(): number {
  const raw = process.env.PHOTO_RETENTION_CLEANUP_INTERVAL_HOURS?.trim();
  if (raw) {
    const hours = Number(raw);
    if (Number.isFinite(hours) && hours > 0) {
      return Math.round(hours) * 60 * 60 * 1000;
    }
  }
  return DEFAULT_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
}
