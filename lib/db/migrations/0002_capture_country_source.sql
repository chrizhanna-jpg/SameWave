-- SameWave: capture country provenance on photos (additive only).
-- Nullable text — matches music_genre style (no CHECK enum at DB level;
-- api-server validates gps|photo|fallback on write).
--
-- Schema matches lib/db/src/schema/photos.ts (captureCountrySource).

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS capture_country_source text;

-- Notes:
-- 1. No backfill — existing rows stay NULL (clients treat as fallback/approx).
-- 2. No index — provenance is returned with the photo row, not filtered on.
