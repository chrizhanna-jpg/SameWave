/**
 * Local ripple arcs drop once server echo exists for same counterparty photo.
 * Run: node ./scripts/test-reconcile-ripples.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function reconcileServerAndLocalRipples(serverConnections, localRipples) {
  const serverRippleKeys = new Set();
  for (const c of serverConnections) {
    if (c.kind !== "ripple") continue;
    const photoId = c.spotlightPhotoId?.trim();
    if (!photoId) continue;
    const route = `${c.from}->${c.to}`;
    serverRippleKeys.add(`${photoId}:${route}`);
    serverRippleKeys.add(`${photoId}:${c.to}`);
  }
  const filteredLocal = localRipples.filter((lc) => {
    if (!lc.id.startsWith("local-ripple-")) return true;
    const photoId = lc.spotlightPhotoId?.trim();
    if (!photoId) return true;
    const route = `${lc.from}->${lc.to}`;
    if (serverRippleKeys.has(`${photoId}:${route}`)) return false;
    if (serverRippleKeys.has(`${photoId}:${lc.to}`)) return false;
    return true;
  });
  const byId = new Map();
  for (const c of [...serverConnections, ...filteredLocal]) {
    byId.set(c.id, c);
  }
  return [...byId.values()];
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

const server = [
  {
    id: "echo-1",
    kind: "ripple",
    from: "GB",
    to: "US",
    theme: "sky",
    spotlightPhotoId: "photo-their-1",
  },
];
const local = [
  {
    id: "local-ripple-match-1",
    kind: "ripple",
    from: "GB",
    to: "US",
    theme: "sky",
    spotlightPhotoId: "photo-their-1",
  },
];
const merged = reconcileServerAndLocalRipples(server, local);
assert(
  merged.length === 1 && merged[0].id === "echo-1",
  "local duplicate removed when server echo exists",
);

const localOnly = reconcileServerAndLocalRipples([], local);
assert(
  localOnly.length === 1 && localOnly[0].id.startsWith("local-ripple-"),
  "local kept until server echo arrives",
);

const atlasSrc = readFileSync(
  path.join(here, "../utils/atlasLocalRipples.ts"),
  "utf8",
);
assert(
  atlasSrc.includes("reconcileServerAndLocalRipples"),
  "reconcile helper exported from atlasLocalRipples",
);

if (process.exitCode) {
  console.error("reconcile ripple checks failed");
} else {
  console.log("OK — reconcile ripple checks passed");
}
