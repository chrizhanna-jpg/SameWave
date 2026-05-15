/**
 * "Macro" entry: banner + Expo Go + QR in this terminal (stdio inherited).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log(
  "\n\x1b[1mSameWave — Open the Expo Go app, then scan the QR code printed below.\x1b[0m\n",
);

const child = spawn("pnpm", ["exec", "expo", "start", "--go"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
