-- NOT RUN by the server. Owner cleanup for the ~10 test uploads that still
-- hold JPEG/audio base64 in Postgres. Do not run this after real users exist:
-- the DELETE below removes every non-stock, non-atlas-seed photo.
--
-- Stock rows (id LIKE 'stock_%', about 508) are not touched. They already
-- serve from the Unsplash CDN. Deleting them does NOT re-seed on boot.
-- The deck only emits a stock card when that row exists; stockPhotoCdn.ts
-- maps stock_pool_v1_p_N / stock_coffee_v2_p_N to Unsplash by id. Restoring
-- the pool is a manual `pnpm --filter @workspace/api-server run seed:stock-pool:apply`
-- (and the coffee replacer, if those ids were removed). Echoes that pointed
-- at a deleted stock photo would cascade away with it. Leave stock_% in place.
--
-- Atlas demo rows (id LIKE 'atlas_global_seed_%') are also left alone. They
-- are recreated only by `pnpm run seed:atlas-global`, not on boot.
--
-- Cascades when a photos row is deleted (FK onDelete):
--   echoes.photo_low_id / photo_high_id  -> CASCADE (the wave/ripple is removed
--     if either photo goes; a pair disappears when one side is deleted)
--   votes.photo_id                        -> CASCADE (votes ON that photo)
--   votes.voter_photo_id                  -> SET NULL (votes the deleted photo
--     cast on someone else stay, but lose the "which of my photos" pointer)
--   seen_photos.photo_id                  -> CASCADE
--   reports.photo_id                      -> CASCADE
-- Users are not deleted. R2 objects are not deleted by this SQL — these test
-- rows were stored before R2 keys existed, so there is nothing in the bucket.
--
-- Preview the rows first:
--   SELECT id, user_id, octet_length(bytes_base64) AS original_bytes,
--          original_key IS NOT NULL AS in_r2
--   FROM photos
--   WHERE id NOT LIKE 'stock_%'
--     AND id NOT LIKE 'atlas_global_seed_%';

BEGIN;

DELETE FROM photos
WHERE id NOT LIKE 'stock_%'
  AND id NOT LIKE 'atlas_global_seed_%';

-- If a later copy into R2 has populated original_key and you only want to
-- drop the Postgres byte copies (keep the photo, echo, and vote rows):
-- UPDATE photos
-- SET bytes_base64 = NULL,
--     display_bytes_base64 = NULL,
--     deck_preview_base64 = NULL,
--     custom_audio_base64 = NULL
-- WHERE id NOT LIKE 'stock_%'
--   AND original_key IS NOT NULL
--   AND btrim(original_key) <> '';
-- Do not null content_prefix_md5. Deck dedup reads that column once
-- bytes_base64 is gone; clearing it collapses those photos onto one hash.

COMMIT;
