/**
 * Asset class + sample URI helpers — run from same-same:
 *   pnpm exec tsx scripts/test-image-asset-class.ts
 */
import {
  classifyImageUri,
  isSampleAssetUri,
  isUserUploadUri,
} from "../utils/imageAssetClass";
import {
  criticalSampleUris,
  SAMPLE_ASSET_HOST,
} from "../utils/sampleAssetPrefetch";

function assert(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

assert(
  "unsplash is sample",
  classifyImageUri(
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=480",
  ) === "sample",
);

assert(
  "api stream is user_upload",
  classifyImageUri("https://samewave.onrender.com/api/photos/abc-123/image?w=320") ===
    "user_upload",
);

assert("file is local", classifyImageUri("file:///tmp/x.jpg") === "local");

const samples = criticalSampleUris(5);
assert("critical samples non-empty", samples.length === 5);
assert(
  "samples hosted on unsplash",
  samples.every((u) => u.startsWith(SAMPLE_ASSET_HOST)),
);
assert("isSampleAssetUri", isSampleAssetUri(samples[0]!));
assert(
  "isUserUploadUri",
  isUserUploadUri("https://samewave.onrender.com/api/photos/x/image?w=480"),
);

console.log("sample uris", samples.map((u) => u.slice(0, 72)));
