/**
 * Unit tests for the R2 photo store (mocked S3 client).
 * Run from artifacts/api-server: node ./scripts/test-r2-photo-store.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const outfile = path.join(here, "../.tmp-r2-photo-store.test.mjs");

try {
  await esbuild.build({
    entryPoints: [path.join(here, "../src/lib/r2PhotoStore.test.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    packages: "external",
  });
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", outfile], { stdio: "inherit" });
    child.on("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
} finally {
  await rm(outfile, { force: true });
}
