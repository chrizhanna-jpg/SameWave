/**
 * Root preinstall hook: forbid npm/yarn and remove stray lockfiles.
 * Runs on Node (Windows-safe); replaces the Unix `sh` script from package.json.
 */
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const ua = process.env.npm_config_user_agent ?? "";
const execpath = process.env.npm_execpath ?? "";
const invokedByPnpm = /pnpm/i.test(ua) || /pnpm/i.test(execpath);

if (!invokedByPnpm) {
  console.error("Use pnpm instead of npm/yarn for this workspace.");
  process.exit(1);
}

for (const name of ["package-lock.json", "yarn.lock"]) {
  try {
    const p = join(root, name);
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* ignore */
  }
}
