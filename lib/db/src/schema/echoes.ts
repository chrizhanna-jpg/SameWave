import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { photosTable } from "./photos";

// One row per *unordered pair* of photos. When user A taps "same same" on
// user B's photo (while A is representing one of A's own photos), we
// upsert a row in `pending` state with `pendingFromUserId = A`. If B
// later taps "same same" back on A's same photo, we flip the same row to
// `mutual` — the unique constraint on (low, high) photo IDs guarantees
// only one row per pair regardless of swipe order.
//
// Cascading FKs on both photos and both users mean that if either side's
// photo (or account) is removed, the echo row goes with it.
export const echoesTable = pgTable(
  "echoes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    // Canonical ordering: photoLowId < photoHighId lexicographically so the
    // unique index catches dupes regardless of which direction tapped first.
    photoLowId: varchar("photo_low_id")
      .notNull()
      .references(() => photosTable.id, { onDelete: "cascade" }),
    photoHighId: varchar("photo_high_id")
      .notNull()
      .references(() => photosTable.id, { onDelete: "cascade" }),
    // Owner of photoLowId / photoHighId respectively. Denormalised onto the
    // row so inbox queries don't need a 4-way join.
    userLowId: varchar("user_low_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    userHighId: varchar("user_high_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    theme: varchar("theme", { length: 64 }).notNull().default(""),
    // "pending" → only one side has tapped. The OTHER side has a request
    //              waiting in their inbox.
    // "mutual"  → both sides have tapped same-same. This is a real Echo.
    state: varchar("state", { length: 16 }).notNull().default("pending"),
    // The user_id that already tapped same-same. Null once mutual.
    pendingFromUserId: varchar("pending_from_user_id").references(
      () => usersTable.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    mutualAt: timestamp("mutual_at"),
  },
  (t) => ({
    pairUniq: uniqueIndex("echoes_pair_uniq").on(t.photoLowId, t.photoHighId),
    themeIdx: index("echoes_theme_idx").on(t.theme),
    stateIdx: index("echoes_state_idx").on(t.state),
    userLowIdx: index("echoes_user_low_idx").on(t.userLowId),
    userHighIdx: index("echoes_user_high_idx").on(t.userHighId),
    // Enforce canonical ordering at the DB level so application bugs
    // can't insert (B, A) alongside an existing (A, B) row and bypass
    // the unique-pair guarantee.
    canonicalOrder: check(
      "echoes_canonical_order",
      sql`${t.photoLowId} < ${t.photoHighId}`,
    ),
  }),
);

export const insertEchoSchema = createInsertSchema(echoesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEcho = z.infer<typeof insertEchoSchema>;
export type Echo = typeof echoesTable.$inferSelect;
