import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appState = readFileSync(path.join(here, "../state/AppState.tsx"), "utf8");

test("AppState no longer auto-accepts inbox offers", () => {
  assert.doesNotMatch(appState, /offersToAccept\(/);
  // respondToOffer remains for Match / API callers; inbox no longer wires Wave back.
  assert.match(appState, /respondToOffer/);
  // Matching piece 6: with auto-accept gone, no votes.source='auto' column is needed.
  assert.doesNotMatch(appState, /source:\s*['"]auto['"]/);
});
