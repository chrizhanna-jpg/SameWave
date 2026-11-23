-- SameWave: feeling (emotion) on photos (additive only).
-- Nullable text — matches music_genre / capture_country_source style
-- (no CHECK enum at DB level; api-server validates against EMOTION_IDS on write).
--
-- Schema matches lib/db/src/schema/photos.ts (emotion).

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS emotion text;

-- Notes:
-- 1. No backfill — existing rows stay NULL (clients show topic only when missing).
-- 2. Distinct from music_genre (song / vibe clip); emotion is the chosen Feeling.
