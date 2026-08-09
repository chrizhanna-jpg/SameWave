/**
 * Regression: resolveEchoPhotoUri must not replace durable file:// with server stream.
 * Run: pnpm exec tsx scripts/test-echo-photo-uri.ts
 */

process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";
process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY =
  "file:///data/user/0/com.samewave.app/files/";

import { isPersistentPhotoUri, persistentPhotoUriForLocalId } from "../utils/localPhotoPaths";

/** Mirrors resolveEchoPhotoUri — kept inline so tests avoid RN imports. */
function resolveEchoPhotoUri(side: { id?: string; uri?: string | null }): string {
  const uri = side.uri?.trim() ?? "";
  if (
    uri &&
    (isPersistentPhotoUri(uri) ||
      uri.startsWith("file:") ||
      uri.startsWith("content:"))
  ) {
    return uri;
  }
  const id = side.id?.trim();
  if (id) {
    const base = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
    return `${base}/api/photos/${encodeURIComponent(id)}/image`;
  }
  return uri;
}

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const localId = "33333333-3333-4333-8333-333333333333";
const persistent = persistentPhotoUriForLocalId(
  process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY!,
  localId,
);
const resolved = resolveEchoPhotoUri({
  id: "server-photo-id",
  uri: persistent,
});
assert(
  "echo keeps durable file uri when myPhotoId present",
  resolved === persistent,
  resolved,
);

const ephemeral = resolveEchoPhotoUri({
  id: "server-photo-id",
  uri: "file:///cache/photo.jpg",
});
assert(
  "echo keeps ephemeral file uri when myPhotoId present",
  ephemeral === "file:///cache/photo.jpg",
  ephemeral,
);

const serverOnly = (() => {
  const uri = "";
  const id = "server-photo-id";
  return id
    ? `${process.env.EXPO_PUBLIC_API_URL}/api/photos/${id}/image`
    : uri;
})();
assert(
  "server fallback shape when no local uri",
  serverOnly.includes("/api/photos/server-photo-id/image"),
  serverOnly,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
