/**
 * Unit tests for photo storage and upload limits.
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
const sources = [
  "../src/lib/r2PhotoStore.test.ts",
  "../src/lib/photoLimits.test.ts",
];
const outfiles = sources.map((src) =>
  path.join(here, `../.tmp-${path.basename(src, ".ts")}.mjs`),
);

try {
  await Promise.all(
    sources.map((src, i) =>
      esbuild.build({
        entryPoints: [path.join(here, src)],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: outfiles[i],
        packages: "external",
      }),
    ),
  );
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", ...outfiles], { stdio: "inherit" });
    child.on("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
} finally {
  await Promise.all(outfiles.map((outfile) => rm(outfile, { force: true })));
}
