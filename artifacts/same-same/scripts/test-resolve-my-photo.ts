/**
 * Local verification for resolveMatchMyPhotoUri — run from same-same:
 *   pnpm exec tsx scripts/test-resolve-my-photo.ts
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
process.env.EXPO_PUBLIC_DEV_API_URL = "http://192.168.1.143:8787";

import {
  enrichMatchMyPhotoFields,
  resolveMatchMyPhotoUri,
} from "../utils/photoDisplayUri";
import { mergeMatchesById } from "../utils/syncCache";
import { setVoterPhotoMapForTests } from "../utils/voterPhotoByTarget";
import type { Match, MyPhoto } from "../context/AppContext";

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

console.log("Done. exitCode=", process.exitCode ?? 0);
