import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { vector } from "./_vector";

// One row per user-uploaded photo. The actual JPEG bytes are stored as
// base64 text for MVP simplicity — when traffic justifies it we'll move
// the bytes to object storage and keep just a key here.
//
// `embedding` is a pgvector column built from theme + tags via Gemini's
// text-embedding-004 model. We use it for cosine-similarity matching so
// we don't have to call Gemini live on every swipe.
export const photosTable = pgTable(
  "photos",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    // Image bytes (base64-encoded). Capped at ~8MB binary upstream.
    bytesBase64: text("bytes_base64").notNull(),
    mimeType: varchar("mime_type", { length: 32 }).notNull().default("image/jpeg"),

    // AI-derived metadata used for similarity + display.
    theme: varchar("theme", { length: 64 }).notNull().default(""),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    // Visual-form / composition tags (circles, lines, vertical, symmetry…)
    // returned by the same Gemini pass that produces `theme` and `tags`.
    // Used by the secondary "match by subject matter" mode, which scores
    // 50% on shared subject (objects) and 50% on shared shapes — and as a
    // soft tie-breaker in the primary deck. Defaults to an empty array
    // so legacy rows uploaded before the column existed still load
    // cleanly (the scoring SQL treats an empty intersection as 0 pts).
    shapeTags: text("shape_tags").array().notNull().default(sql`ARRAY[]::text[]`),
    // Free-form concrete subjects/objects visible in the frame
    // ("apple", "sculpture", "park", "bicycle", "latte art", …). Unlike
    // `tags`, which draws from a small fixed lifestyle vocabulary, this
    // column accepts any short noun-token Gemini emits — that's the
    // whole point: lets the matcher score real subject overlap (e.g.
    // two apple-core sculptures share ["apple","sculpture"]) instead of
    // collapsing every outdoor-art photo into the same generic
    // ["art","outdoors"] bucket. Capped at 6 tokens upstream. Empty
    // for legacy rows uploaded before the column existed; backfilled by
    // POST /api/photos/backfill-subjects.
    subjects: text("subjects").array().notNull().default(sql`ARRAY[]::text[]`),
    // Gemini text-embedding-004 → 768 dimensions.
    embedding: vector("embedding", { dimensions: 768 }),

    countryCode: varchar("country_code", { length: 2 }),
    // ISO country from coarse GPS at in-app camera capture. When set,
    // this is the honest "where this moment was taken" signal — distinct
    // from `countryCode`, which is the uploader's profile/default at post
    // time (library uploads, legacy rows). Geo ripples require capture.
    captureCountryCode: varchar("capture_country_code", { length: 2 }),

    // Real capture time of the moment — EXIF DateTimeOriginal for library
    // picks, or the shutter instant for in-app camera shots. This is the
    // honest "when this photo was actually taken" signal used by the
    // temporal match tiers (Same Hour / Day / Week / Month). Nullable:
    // many shared photos (messaging apps, screenshots, downloads) have no
    // capture metadata, and legacy rows predate this column. When null,
    // the client falls back to `created_at` (upload/share time) at
    // compute time and surfaces a soft "matched by when you shared it"
    // note — we deliberately store null here rather than backfilling with
    // upload time so the fallback stays detectable downstream.
    capturedAt: timestamp("captured_at"),

    // Music vibe (the "vibe clip" feature). Lower-case genre id from
    // artifacts/same-same/data/musicLibrary.ts (e.g. "classic", "rock").
    // Nullable so the column is backwards-compatible with photos
    // uploaded before the feature shipped — the client falls back to
    // its local suggestGenre() in that case.
    musicGenre: varchar("music_genre", { length: 32 }),

    // Optional user-recorded vibe clip. When present, the match feed
    // plays this on loop INSTEAD of the music_genre clip — same
    // playback infra, just a `data:` URL. Capped to ~10s of audio
    // upstream so the row stays under a few hundred KB.
    customAudioBase64: text("custom_audio_base64"),
    customAudioMime: varchar("custom_audio_mime", { length: 32 }),

    // Lifecycle.
    status: varchar("status", { length: 16 }).notNull().default("active"),
    reportCount: integer("report_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Retention window from upload for free users (server default 90 days via
    // PHOTO_RETENTION_DAYS); null for Pro (kept indefinitely).
    expiresAt: timestamp("expires_at"),

    // Pre-encoded deck sizes generated once at upload (or backfill). Avoids
    // reading multi-MB bytes_base64 + sharp on every Ripple stream.
    displayBytesBase64: text("display_bytes_base64"),
    displayMime: varchar("display_mime", { length: 32 }),
    // Smaller inline preview (480w) embedded in /candidates JSON as a data:
    // URI so the matching deck paints with zero extra image round-trips.
    deckPreviewBase64: text("deck_preview_base64"),
    deckPreviewMime: varchar("deck_preview_mime", { length: 32 }),
  },
  (t) => ({
    statusIdx: index("photos_status_idx").on(t.status),
    expiresIdx: index("photos_expires_idx").on(t.expiresAt),
    userIdx: index("photos_user_idx").on(t.userId),
  }),
);

export const insertPhotoSchema = createInsertSchema(photosTable).omit({
  id: true,
  createdAt: true,
  reportCount: true,
});
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;
export type Photo = typeof photosTable.$inferSelect;
