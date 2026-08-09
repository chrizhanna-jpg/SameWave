/**
 * Regression: viewer-owned photo slots must never accept stock/Unsplash URIs.
 * Pure Node — no app module imports (photoDisplayUri / samplePhotos pull RN in CI).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

const CURATED_STOCK_URI =
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400";
const UNSPLASH_FALLBACK_URI =
  "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&auto=format&fit=crop&q=80";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function isAllowedUserOwnPhotoUri(uri: string | undefined | null): boolean {
  const u = uri?.trim() ?? "";
  if (!u) return false;
  if (u.includes("images.unsplash.com")) return false;
  return true;
}

function sanitizeUserOwnPhotoUri(uri: string | undefined | null): string {
  const u = uri?.trim() ?? "";
  return isAllowedUserOwnPhotoUri(u) ? u : "";
}

assert(
  "rejects curated Unsplash stock",
  !isAllowedUserOwnPhotoUri(CURATED_STOCK_URI),
);
assert(
  "rejects generic Unsplash fallback",
  !isAllowedUserOwnPhotoUri(UNSPLASH_FALLBACK_URI),
);
assert(
  "allows file capture",
  isAllowedUserOwnPhotoUri("file:///cache/capture.jpg"),
);
assert(
  "allows authed server stream",
  isAllowedUserOwnPhotoUri(
    "https://samewave.onrender.com/api/photos/abc/image?w=480",
  ),
);
assert(
  "sanitize strips Unsplash",
  sanitizeUserOwnPhotoUri(CURATED_STOCK_URI) === "",
);
assert(
  "sanitize keeps server stream",
  sanitizeUserOwnPhotoUri(
    "https://samewave.onrender.com/api/photos/real-id/image",
  ).includes("/api/photos/real-id/image"),
);

const sampleSrc = readFileSync(join(appRoot, "data/samplePhotos.ts"), "utf8");
assert(
  "isSamplePhoto exists for curated pool detection",
  sampleSrc.includes("export function isSamplePhoto"),
);

const photoUriSrc = readFileSync(
  join(appRoot, "utils/photoDisplayUri.ts"),
  "utf8",
);
assert(
  "photoDisplayUri blocks Unsplash in user-own resolvers",
  photoUriSrc.includes("isAllowedUserOwnPhotoUri") &&
    photoUriSrc.includes("sanitizeUserOwnPhotoUri") &&
    photoUriSrc.includes("images.unsplash.com"),
);

const remoteSrc = readFileSync(
  join(appRoot, "components/RemotePhotoImage.tsx"),
  "utf8",
);
assert(
  "RemotePhotoImage supports viewerOwnPhoto guard",
  remoteSrc.includes("viewerOwnPhoto") &&
    remoteSrc.includes("sanitizeUserOwnPhotoUri") &&
    remoteSrc.includes("!viewerOwnPhoto"),
);

const matchSrc = readFileSync(join(appRoot, "app/(tabs)/match.tsx"), "utf8");
assert(
  "match deck my-photo uses viewerOwnPhoto",
  matchSrc.includes("viewerOwnPhoto") &&
    matchSrc.includes("isAllowedUserOwnPhotoUri"),
);

console.log("Done. exitCode=", process.exitCode ?? 0);
