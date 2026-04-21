import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";

// One row per Expo push token registered for a user. A user may have
// multiple devices, so userId is NOT unique. The token itself is unique
// (Expo issues a stable token per install). When a device re-registers
// (e.g. after reinstall), we upsert on the token to refresh the userId
// + updatedAt, so notifications always reach the correct current owner.
export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expoToken: varchar("expo_token", { length: 256 }).notNull().unique(),
    platform: varchar("platform", { length: 16 }).notNull().default("unknown"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("push_tokens_user_idx").on(t.userId),
  }),
);

export const insertPushTokenSchema = createInsertSchema(pushTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type PushToken = typeof pushTokensTable.$inferSelect;
