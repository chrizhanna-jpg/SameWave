import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Must run before `./app` so `DATABASE_URL` exists when `@workspace/db` loads.
// Use path next to the compiled bundle (`dist/`) or source (`src/`), not `process.cwd()` — pnpm/IDE cwd varies on Windows.
const here = path.dirname(fileURLToPath(import.meta.url));
const apiServerRoot = path.resolve(here, "..");
config({ path: path.join(apiServerRoot, ".env") });
