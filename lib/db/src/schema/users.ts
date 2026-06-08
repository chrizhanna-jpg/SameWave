import { sql } from "drizzle-orm";
import { pgTable, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// A user is anonymous-by-design. Phase 1: we identify them by a stable
// device-generated ID (stored in AsyncStorage on first launch). Phase 2:
// when we add Clerk Google sign-in, we'll populate `authId` and merge
// device-IDs onto real accounts.
export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Stable client-generated identifier. Unique so we get one row per device.
  deviceId: varchar("device_id", { length: 64 }).unique(),
  // Clerk user ID once the user signs in (nullable until then).
  authId: varchar("auth_id", { length: 128 }).unique(),
  // ISO-3166-1 alpha-2 country code (e.g. "JP"). Matches the mobile app.
  countryCode: varchar("country_code", { length: 2 }),
  // Pro users get extended retention (no expiry on their photos).
  isPro: boolean("is_pro").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
