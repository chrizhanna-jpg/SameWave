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
    // Gemini text-embedding-004 → 768 dimensions.
    embedding: vector("embedding", { dimensions: 768 }),

    countryCode: varchar("country_code", { length: 2 }),

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
    // 30 days from upload for free users; null for Pro (kept indefinitely).
    expiresAt: timestamp("expires_at"),
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
