#!/usr/bin/env node
/**
 * Runs all core regression scripts. Fails fast on first error.
 * Usage: pnpm test:core
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const scripts = [
  "test-core-flows.ts",
  "test-waves-voter-photo.ts",
  "test-waves-offline-thumb.ts",
  "test-match-flash-uri.ts",
  "test-defer-tab-focus.ts",
  "test-scroll-perf-hints.ts",
];

let failed = 0;
for (const script of scripts) {
  console.log(`\n▶ ${script}`);
  const r = spawnSync("pnpm", ["exec", "tsx", join("scripts", script)], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    failed += 1;
    console.error(`✗ ${script} failed (exit ${r.status})`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} core test script(s) failed`);
  process.exit(1);
}
console.log("\n✓ All core regression tests passed");
