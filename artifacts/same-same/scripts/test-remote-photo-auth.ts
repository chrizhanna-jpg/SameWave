/**
 * Regression checks for authed user-photo loading after Expo reload.
 * Run: pnpm exec tsx scripts/test-remote-photo-auth.ts
 */

import {
  resolveMyPhotoThumbnailUri,
  resolveMatchMyPhotoThumbnailUri,
} from "../utils/photoDisplayUri";
import type { Match, MyPhoto } from "../context/AppContext";

process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const photo: MyPhoto = {
  uri: "",
  uploadedAt: "2026-07-04T10:00:00.000Z",
  theme: "joy",
  backendId: "user-photo-123",
  uploadState: "ok",
};

const thumb = resolveMyPhotoThumbnailUri(photo);
assert(
  "thumbnail from backendId when uri stripped",
  thumb.includes("/api/photos/user-photo-123/image") && thumb.includes("w=320"),
  thumb,
);

const match: Match = {
  id: "m1",
  myPhoto: "",
  theirPhoto: "https://images.unsplash.com/photo-1?w=400",
  myPhotoId: "user-photo-456",
  myCountry: "UK",
  theirCountry: "US",
  theirCountryFlag: "🇺🇸",
  theirCountryCode: "US",
  similarityScore: 0,
  verdict: "same",
  timestamp: "2026-07-04T11:00:00.000Z",
  theirPhotoId: "their-1",
};

const waveThumb = resolveMatchMyPhotoThumbnailUri(match, []);
assert(
  "waves voter thumb from myPhotoId",
  waveThumb.includes("/api/photos/user-photo-456/image"),
  waveThumb,
);

function hasBearerAuth(headers: Record<string, string> | undefined): boolean {
  return Boolean(headers?.Authorization?.startsWith("Bearer "));
}

assert("bearer detect positive", hasBearerAuth({ Authorization: "Bearer abc" }));
assert("bearer detect negative", !hasBearerAuth({ "X-Device-Id": "x" }));
assert("bearer detect undefined", !hasBearerAuth(undefined));

console.log("Done. exitCode=", process.exitCode ?? 0);
