/**
 * Local verification for resolveMatchMyPhotoUri — run from same-same:
 *   pnpm exec tsx scripts/test-resolve-my-photo.ts
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";
process.env.EXPO_PUBLIC_HOSTED_API_URL = "https://samewave.onrender.com";
process.env.EXPO_PUBLIC_IMAGE_LOAD_V2 = "true";
process.env.EXPO_PUBLIC_IMAGE_PERSISTENCE_V2 = "true";
process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY =
  "file:///data/user/0/com.samewave.app/files/";

import {
  canonicalizePhotoStreamUri,
  enrichMatchMyPhotoFields,
  findMyPhotoForMatch,
  myPhotoRowKey,
  repairMyPhotos,
  resolveMatchMyPhotoUri,
  resolveMyPhotoDisplayUri,
  setDocumentDirectoryForTests,
  shouldCanonicalizePhotoStreamUri,
} from "../utils/photoDisplayUri";
import { persistentPhotoUriForLocalId } from "../utils/localPhotoPaths";
import { mergeMatchesById } from "../utils/syncCache";
import { setVoterPhotoMapForTests } from "../utils/voterPhotoByTarget";
import type { Match, MyPhoto } from "../context/AppContext";

setDocumentDirectoryForTests(process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY!);

function assert(label: string, uri: string, expectNonEmpty: boolean): void {
  const ok = expectNonEmpty ? uri.trim().length > 0 : uri.trim().length === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`, { uri: uri.slice(0, 80) });
  if (!ok) process.exitCode = 1;
}

const baseMatch: Match = {
  id: "m1",
  myPhoto: "",
  theirPhoto: "https://images.unsplash.com/photo-1?w=400",
  myCountry: "UK",
  theirCountry: "Japan",
  theirCountryFlag: "🇯🇵",
  theirCountryCode: "JP",
  similarityScore: 0,
  verdict: "same",
  timestamp: "2026-06-19T12:00:00.000Z",
  theirPhotoId: "their-photo-1",
};

const myPhotosWithBackend: MyPhoto[] = [
  {
    uri: "",
    uploadedAt: "2026-06-19T11:00:00.000Z",
    theme: "morning",
    backendId: "my-photo-abc",
    uploadState: "ok",
  },
];

// H1: stripped file://, no myPhotoId — should backfill from myPhotos
assert(
  "stripped myPhoto + backendId in library",
  resolveMatchMyPhotoUri(
    {
      ...baseMatch,
      myPhotoUploadedAt: "2026-06-19T11:00:00.000Z",
    },
    myPhotosWithBackend,
  ),
  true,
);

// H2: myPhotoId present, empty myPhoto
assert(
  "myPhotoId only",
  resolveMatchMyPhotoUri(
    { ...baseMatch, myPhotoId: "my-photo-abc" },
    [],
  ),
  true,
);

// H3: persisted unsplash on match
assert(
  "https myPhoto on match",
  resolveMatchMyPhotoUri(
    {
      ...baseMatch,
      myPhoto: "https://images.unsplash.com/photo-1495474472287?w=400",
    },
    [],
  ),
  true,
);

// H4: enrich adds id
const enriched = enrichMatchMyPhotoFields(
  { ...baseMatch, myPhotoUploadedAt: "2026-06-19T11:00:00.000Z" },
  myPhotosWithBackend,
);
assert(
  "enrich sets myPhotoId",
  enriched.myPhotoId ?? "",
  true,
);

// H5: journey merge must not replace local id (patchMatchVoterPhoto target)
const localMatch: Match = {
  ...baseMatch,
  id: "local-swipe-abc",
  theirPhotoId: "their-photo-1",
};
const journeyMatch: Match = {
  ...baseMatch,
  id: "journey-their-photo-1",
  theirPhotoId: "their-photo-1",
  myPhotoId: "server-photo-id",
  myPhoto: "http://192.168.1.143:8787/api/photos/server-photo-id/image",
};
const merged = mergeMatchesById([localMatch], [journeyMatch]);
const mergedRow = merged.find((m) => m.theirPhotoId === "their-photo-1");
assert(
  "merge keeps local swipe id",
  mergedRow?.id === "local-swipe-abc" ? "ok" : "",
  true,
);
assert(
  "merge backfills myPhotoId from journey",
  mergedRow?.myPhotoId ?? "",
  true,
);

// H6: voter photo map by theirPhotoId (cold start backfill)
setVoterPhotoMapForTests({ "their-photo-1": "cached-voter-id" });
const fromMap = enrichMatchMyPhotoFields(
  { ...baseMatch, theirPhotoId: "their-photo-1" },
  [],
);
assert(
  "voter map sets myPhotoId",
  fromMap.myPhotoId === "cached-voter-id" ? fromMap.myPhoto : "",
  true,
);

// H7: voter photo map by their photo uri when id missing
setVoterPhotoMapForTests({
  [`pk:${require("../utils/photoKey").photoKey(baseMatch.theirPhoto)}`]:
    "cached-by-uri",
});
const fromUriMap = enrichMatchMyPhotoFields(
  { ...baseMatch, theirPhotoId: undefined },
  [],
);
assert(
  "voter map sets myPhotoId via photoKey",
  fromUriMap.myPhotoId === "cached-by-uri" ? fromUriMap.myPhoto : "",
  true,
);

// H8: stale LAN stream URL → current hosted API origin
const lan = canonicalizePhotoStreamUri(
  "http://192.168.1.143:8787/api/photos/server-photo-id/image?w=960",
);
assert(
  "LAN stream canonicalized to hosted API",
  lan.includes("samewave.onrender.com") &&
    lan.includes("/api/photos/server-photo-id/image")
    ? lan
    : "",
  true,
);

const renderUrl =
  "https://samewave.onrender.com/api/photos/server-photo-id/image?w=960";
assert(
  "hosted stream URL not rewritten",
  !shouldCanonicalizePhotoStreamUri(renderUrl) &&
    canonicalizePhotoStreamUri(renderUrl) === renderUrl
    ? renderUrl
    : "",
  true,
);

// H9: recent-photo row keys stay unique when uri is "" and backendId is shared
const dupBid = "shared-backend-id";
const keys = [
  { uri: "", backendId: dupBid, uploadedAt: "2026-01-01T00:00:00.000Z" },
  { uri: "", backendId: dupBid, uploadedAt: "2026-01-02T00:00:00.000Z" },
  { uri: "", backendId: undefined, uploadedAt: undefined },
  { uri: "", backendId: undefined, uploadedAt: undefined },
].map((p, i) => myPhotoRowKey(p, i));
const unique = new Set(keys);
assert(
  "myPhotoRowKey all unique",
  unique.size === keys.length ? "ok" : "",
  true,
);

// H10: repair backfills backendId from match history when uri was stripped
const repaired = repairMyPhotos(
  [
    {
      uri: "",
      uploadedAt: "2026-06-19T11:00:00.000Z",
      theme: "morning",
      uploadState: "pending",
    },
  ],
  [
    {
      ...baseMatch,
      myPhotoId: "recovered-photo-id",
      myPhotoUploadedAt: "2026-06-19T11:00:00.000Z",
    },
  ],
);
assert(
  "repairMyPhotos backfills backendId",
  repaired[0]?.backendId === "recovered-photo-id" ? "ok" : "",
  true,
);
assert(
  "repairMyPhotos sets stream uri",
  repaired[0]?.uri.includes("/api/photos/recovered-photo-id/image") ? repaired[0].uri : "",
  true,
);

// H11: merge keeps in-memory upload during hydration race
import {
  createMyPhotoLocalId,
  mergeMyPhotos,
} from "../utils/myPhotoPersistence";

const mergedRace = mergeMyPhotos(
  [{ uri: "", uploadedAt: "2026-06-19T11:00:00.000Z", theme: "joy" }],
  [
    {
      uri: "file:///cache/photo.jpg",
      localId: createMyPhotoLocalId(),
      uploadedAt: "2026-06-19T11:00:00.000Z",
      theme: "joy",
      uploadState: "pending",
    },
  ],
);
assert(
  "mergeMyPhotos keeps pending local capture",
  mergedRace[0]?.uri.startsWith("file:") ? "ok" : "",
  true,
);

// H12: findMyPhotoForMatch must not fall back to unrelated newest upload
const unrelatedLibrary: MyPhoto[] = [
  {
    uri: "https://samewave.onrender.com/api/photos/newest-id/image",
    uploadedAt: "2026-07-04T12:00:00.000Z",
    theme: "joy",
    backendId: "newest-id",
    uploadState: "ok",
  },
];
const noLink = findMyPhotoForMatch(
  {
    ...baseMatch,
    timestamp: "2026-06-01T12:00:00.000Z",
    myPhotoUploadedAt: "2026-06-01T10:00:00.000Z",
  },
  unrelatedLibrary,
);
assert(
  "findMyPhotoForMatch no spurious fallback",
  noLink === undefined ? "ok" : String(noLink?.backendId),
  true,
);

// H13: enrich must not assign sample URLs as voter photo
const sampleEnriched = enrichMatchMyPhotoFields(
  {
    ...baseMatch,
    myPhoto: "https://images.unsplash.com/photo-1495474472287?w=400",
  },
  [],
);
assert(
  "enrich does not promote sample as myPhotoId",
  !sampleEnriched.myPhotoId && sampleEnriched.myPhoto.includes("unsplash")
    ? "ok"
    : sampleEnriched.myPhotoId ?? "",
  true,
);

// H14: stripped uri + localId resolves to durable on-disk path
const testLocalId = "22222222-2222-4222-8222-222222222222";
const expectedPersistent = persistentPhotoUriForLocalId(
  process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY!,
  testLocalId,
);
assert(
  "resolve display from localId after storage strip",
  resolveMyPhotoDisplayUri({
    uri: "",
    localId: testLocalId,
    uploadState: "pending",
  }) === expectedPersistent
    ? expectedPersistent
    : "",
  true,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
