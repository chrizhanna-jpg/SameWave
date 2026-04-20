import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { photosTable } from "./photos";

// One row per (voter, photo) pair so we never show the same photo twice
// and we can derive "Same Same" pair counts later.
export const votesTable = pgTable(
  "votes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    voterUserId: varchar("voter_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    photoId: varchar("photo_id")
      .notNull()
      .references(() => photosTable.id, { onDelete: "cascade" }),
    // "same" or "different"
    verdict: varchar("verdict", { length: 16 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqVoter: uniqueIndex("votes_voter_photo_uniq").on(t.voterUserId, t.photoId),
  }),
);

export const insertVoteSchema = createInsertSchema(votesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertVote = z.infer<typeof insertVoteSchema>;
export type Vote = typeof votesTable.$inferSelect;
