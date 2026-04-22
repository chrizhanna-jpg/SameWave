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
import { usersTable } from "./users";
import { photosTable } from "./photos";

// Server-side mirror of the client's "seen photos" ledger. A row exists
// when a candidate photo has been displayed to (or otherwise consumed by)
// a given user — independent of whether they cast a vote. This lets the
// /api/photos/candidates endpoint suppress photos the user has already
// reacted to even after a reinstall or on a second device.
//
// Votes already imply seen, so the candidates query unions both. We still
// keep this table separate (rather than synthesising a "different" vote)
// so analytics on real verdicts stays clean.
export const seenPhotosTable = pgTable(
  "seen_photos",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    photoId: varchar("photo_id")
      .notNull()
      .references(() => photosTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("seen_photos_user_photo_uniq").on(t.userId, t.photoId),
    userIdx: index("seen_photos_user_idx").on(t.userId),
  }),
);

export const insertSeenPhotoSchema = createInsertSchema(seenPhotosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSeenPhoto = z.infer<typeof insertSeenPhotoSchema>;
export type SeenPhoto = typeof seenPhotosTable.$inferSelect;
