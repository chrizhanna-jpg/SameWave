import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Server-driven catalog of owner-approved theme / vibe words.
//
// Users upload photos with a free-text `theme` word and a `music_genre`
// ("vibe") word. When the word isn't one of the app's hardcoded presets
// (artifacts/same-same/data/themeMatch.ts + musicLibrary.ts), the client
// falls back to a generic ✨ icon and a derived vibe. This table lets the
// owner promote such submitted words into first-class catalog entries that
// go live in the app instantly (served via GET /api/catalog) — no rebuild.
//
// The hardcoded presets remain the base; rows here layer on top by
// `(kind, word)`. `word` is the normalized key (trimmed, lower-cased, with
// the "your/a/an/the " prefix stripped) so lookups from the client match
// regardless of original casing.
export const themeCatalogTable = pgTable(
  "theme_catalog",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

    // Normalized canonical key the client looks up by. Unique per kind.
    word: varchar("word", { length: 64 }).notNull(),
    // "theme" (daily-challenge word → icon) or "vibe" (music_genre word).
    kind: varchar("kind", { length: 8 }).notNull(),

    // Human-readable label shown in the app (defaults to the word).
    title: varchar("title", { length: 80 }).notNull(),
    // The icon assigned on approval (a single emoji, kept short).
    emoji: varchar("emoji", { length: 16 }).notNull(),
    // "The music that goes with it" — either a canonical vibe id from
    // musicLibrary.ts (e.g. "calm") which the app resolves to a looping
    // clip, or a direct https track URL. Validated on write.
    musicRef: varchar("music_ref", { length: 512 }).notNull(),

    approvedAt: timestamp("approved_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    kindWordUniq: uniqueIndex("theme_catalog_kind_word_uniq").on(
      t.kind,
      t.word,
    ),
    kindIdx: index("theme_catalog_kind_idx").on(t.kind),
  }),
);

export const insertThemeCatalogSchema = createInsertSchema(themeCatalogTable).omit({
  id: true,
  approvedAt: true,
  createdAt: true,
});
export type InsertThemeCatalog = z.infer<typeof insertThemeCatalogSchema>;
export type ThemeCatalogEntry = typeof themeCatalogTable.$inferSelect;

// Optional "ignore/hide" ledger: a submitted word the owner dismissed so it
// stops surfacing in the admin review list (without approving it). Keyed by
// the same normalized `(kind, word)` as theme_catalog.
export const submittedWordDismissedTable = pgTable(
  "submitted_word_dismissed",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    kind: varchar("kind", { length: 8 }).notNull(),
    word: varchar("word", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    kindWordUniq: uniqueIndex("submitted_word_dismissed_kind_word_uniq").on(
      t.kind,
      t.word,
    ),
  }),
);

export const insertSubmittedWordDismissedSchema = createInsertSchema(
  submittedWordDismissedTable,
).omit({ id: true, createdAt: true });
export type InsertSubmittedWordDismissed = z.infer<
  typeof insertSubmittedWordDismissedSchema
>;
export type SubmittedWordDismissed =
  typeof submittedWordDismissedTable.$inferSelect;
