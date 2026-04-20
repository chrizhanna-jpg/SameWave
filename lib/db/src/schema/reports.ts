import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { photosTable } from "./photos";

// Reports drive moderation. Aggregated count is denormalized onto
// photos.reportCount for cheap filtering during candidate selection.
export const reportsTable = pgTable(
  "reports",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    reporterUserId: varchar("reporter_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    photoId: varchar("photo_id")
      .notNull()
      .references(() => photosTable.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // One report per (reporter, photo). Without this, a single user could
    // single-handedly trip REPORT_HIDE_THRESHOLD by spamming /report.
    uniqReporterPhoto: uniqueIndex("reports_reporter_photo_uniq").on(
      t.reporterUserId,
      t.photoId,
    ),
  }),
);

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
