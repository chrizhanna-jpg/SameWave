/**
 * Windows-friendly dev entry: sets NODE_ENV without cross-env, preserves cwd=api-server.
 */
import { config as loadDotenv } from "dotenv";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "development";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: path.join(root, ".env") });

// Never use shell: true with paths under "C:\Program Files\..." — cmd splits on the space
// and you get `'C:\Program' is not recognized`.
const build = spawnSync(process.execPath, [path.join(root, "build.mjs")], {
  cwd: root,
  stdio: "inherit",
  shell: false,
  env: { ...process.env, NODE_ENV: "development" },
});
if (build.status !== 0 && build.status !== null) process.exit(build.status);
if (build.error) throw build.error;

const start = spawnSync(
  process.execPath,
  ["--enable-source-maps", path.join(root, "dist", "index.mjs")],
  {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, NODE_ENV: "development" },
  },
);
if (start.status !== 0 && start.status !== null) process.exit(start.status);
if (start.error) throw start.error;
