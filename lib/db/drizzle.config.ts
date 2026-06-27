import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import path from "node:path";

/** Load DATABASE_URL from artifacts/api-server/.env so `pnpm --filter @workspace/db run push` works without exporting env in the shell. */
function loadDatabaseUrlFromApiServerEnv(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, "../../artifacts/api-server/.env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("DATABASE_URL=")) {
      process.env.DATABASE_URL = trimmed.slice("DATABASE_URL=".length).trim();
      return;
    }
  }
}

loadDatabaseUrlFromApiServerEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Drizzle Kit runs `glob.sync()` on each path — backslashes in absolute Windows paths break matching.
function schemaGlob(rel: string): string {
  return path.resolve(__dirname, rel).replace(/\\/g, "/");
}

export default defineConfig({
  schema: [
    schemaGlob("src/schema/users.ts"),
    schemaGlob("src/schema/photos.ts"),
    schemaGlob("src/schema/votes.ts"),
    schemaGlob("src/schema/seenPhotos.ts"),
    schemaGlob("src/schema/reports.ts"),
    schemaGlob("src/schema/echoes.ts"),
    schemaGlob("src/schema/pushTokens.ts"),
    schemaGlob("src/schema/themeCatalog.ts"),
    schemaGlob("src/schema/_vector.ts"),
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
