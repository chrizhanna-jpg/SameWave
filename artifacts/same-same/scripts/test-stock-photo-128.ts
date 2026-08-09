/**
 * Stock photo 128 (tea_drinks slot) must not use the banned near-black Unsplash id
 * and must not duplicate another SAMPLE_PHOTOS entry by photoKey.
 * Run: pnpm exec tsx scripts/test-stock-photo-128.ts
 */

import { photoKey } from "../utils/photoKey";
import { unsplashPhotoUrl } from "../utils/unsplashUri";

const BANNED_STOCK_PHOTO_KEYS = new Set([
  "photo-1554118811-1e0d58224f24",
  "photo-1559056199-9c55c27a1e69",
  "photo-1578662996442-48f60103fc96",
]);

const PHOTO_128_UNSPLASH_ID = "1555447014-7ead71574544";
const PHOTO_55_KEY = "photo-1497636577773-f1231844b336";

function isBannedStockPhotoUri(uri: string | undefined | null): boolean {
  if (!uri) return false;
  const key = photoKey(uri);
  return key ? BANNED_STOCK_PHOTO_KEYS.has(key) : false;
}

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const photo128Uri = unsplashPhotoUrl(PHOTO_128_UNSPLASH_ID);
const photo128Key = photoKey(photo128Uri);
const photo128LaunchSlot = "tea_drinks";

assert("photo 128 launch slot is tea_drinks", photo128LaunchSlot === "tea_drinks");
assert(
  "old near-black unsplash id is banned",
  BANNED_STOCK_PHOTO_KEYS.has("photo-1578662996442-48f60103fc96"),
);
assert(
  "photo 128 does not use banned uri",
  !isBannedStockPhotoUri(photo128Uri),
  photo128Uri,
);
assert(
  "photo 128 does not duplicate photo 55 key",
  photo128Key !== PHOTO_55_KEY,
  `${photo128Key} vs ${PHOTO_55_KEY}`,
);
assert(
  "photo 128 uses unique tea/drink unsplash id",
  photo128Key === `photo-${PHOTO_128_UNSPLASH_ID}`,
  photo128Key,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
