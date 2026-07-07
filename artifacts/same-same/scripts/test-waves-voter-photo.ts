/**
 * Each ripple row must keep its own voter photo — not today's newest upload.
 * Mirrors fixed photoDisplayUri logic inline (tsx cannot import RN dependency chain).
 * Run: pnpm exec tsx scripts/test-waves-voter-photo.ts
 */

process.env.EXPO_PUBLIC_API_URL = "https://samewave.onrender.com";
process.env.SAMEWAVE_TEST_DOCUMENT_DIRECTORY =
  "file:///data/user/0/com.samewave.app/files/";

import { photoKey } from "../utils/photoKey";

function uploadTimesEqual(a?: string, b?: string): boolean {
  const sa = a?.trim() ?? "";
  const sb = b?.trim() ?? "";
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const ta = Date.parse(sa);
  const tb = Date.parse(sb);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

function serverPhotoImageUrl(photoId: string, maxWidth = 960): string {
  const base = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  return `${base}/api/photos/${encodeURIComponent(photoId)}/image?w=${maxWidth}`;
}

function extractPhotoStreamId(uri: string): string | null {
  const m = uri.trim().match(/\/api\/photos\/([^/?#]+)\/image(?:[/?#]|$)/);
  return m?.[1]?.trim() || null;
}

type MyPhoto = {
  uri: string;
  uploadedAt: string;
  backendId?: string;
};

type Match = {
  id?: string;
  myPhoto?: string;
  myPhotoId?: string;
  myPhotoUploadedAt?: string;
  timestamp: string;
  theirPhotoId?: string;
};

function resolveMyPhotoDisplayUri(photo: MyPhoto): string {
  const local = photo.uri?.trim() ?? "";
  if (local.startsWith("file:") || local.startsWith("content:")) return local;
  const bid = photo.backendId?.trim();
  if (bid) return serverPhotoImageUrl(bid);
  return local;
}

function photoUriMatchesVoterId(
  uri: string,
  voterId: string,
  myPhotos: MyPhoto[],
): boolean {
  const trimmed = uri.trim();
  const id = voterId.trim();
  if (!trimmed || !id) return false;
  if (extractPhotoStreamId(trimmed) === id) return true;
  const row = myPhotos.find((p) => p.backendId?.trim() === id);
  if (!row) return false;
  const expected = resolveMyPhotoDisplayUri(row);
  return trimmed === expected;
}

function myPhotoRowValidForMatch(photo: MyPhoto, match: Match): boolean {
  const uploadedAt = match.myPhotoUploadedAt?.trim();
  if (uploadedAt) {
    return uploadTimesEqual(photo.uploadedAt, uploadedAt);
  }
  const swipeAt = Date.parse(match.timestamp);
  if (Number.isFinite(swipeAt)) {
    const at = Date.parse(photo.uploadedAt);
    if (Number.isFinite(at) && at > swipeAt) return false;
  }
  return true;
}

function pickMyPhotoAtSwipeTime(
  myPhotos: MyPhoto[],
  swipeTimestamp: string | undefined,
): MyPhoto | undefined {
  const swipeAt = Date.parse(swipeTimestamp ?? "");
  if (!Number.isFinite(swipeAt)) return undefined;
  let best: MyPhoto | undefined;
  let bestAt = -Infinity;
  for (const p of myPhotos) {
    const bid = p.backendId?.trim();
    if (!bid) continue;
    const at = Date.parse(p.uploadedAt);
    if (!Number.isFinite(at) || at > swipeAt) continue;
    if (at >= bestAt) {
      bestAt = at;
      best = p;
    }
  }
  return best;
}

function uriHintMatchesMatch(photo: MyPhoto, match: Match): boolean {
  const voterId = match.myPhotoId?.trim();
  const bid = photo.backendId?.trim();
  if (voterId && bid && voterId !== bid) return false;
  if (match.myPhotoUploadedAt?.trim()) {
    if (!uploadTimesEqual(photo.uploadedAt, match.myPhotoUploadedAt)) return false;
  }
  const swipeAt = Date.parse(match.timestamp);
  if (Number.isFinite(swipeAt)) {
    const at = Date.parse(photo.uploadedAt);
    if (Number.isFinite(at) && at > swipeAt) return false;
  }
  return true;
}

function findMyPhotoForMatch(
  match: Match,
  myPhotos: MyPhoto[],
  stashedMyPhoto?: string,
): MyPhoto | undefined {
  if (match.myPhotoUploadedAt) {
    const exact = myPhotos.find((p) =>
      uploadTimesEqual(p.uploadedAt, match.myPhotoUploadedAt),
    );
    if (exact) return exact;
  }

  const atSwipe = pickMyPhotoAtSwipeTime(myPhotos, match.timestamp);
  if (atSwipe) return atSwipe;

  const photoId = match.myPhotoId?.trim();
  if (photoId) {
    const fromId = myPhotos.find((p) => p.backendId?.trim() === photoId);
    if (fromId && myPhotoRowValidForMatch(fromId, match)) return fromId;
  }

  const uriHints = [stashedMyPhoto, match.myPhoto].filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  for (const hint of uriHints) {
    const key = photoKey(hint);
    if (!key) continue;
    const byKey = myPhotos.find(
      (p) =>
        photoKey(p.uri) === key ||
        photoKey(resolveMyPhotoDisplayUri(p)) === key,
    );
    if (byKey && uriHintMatchesMatch(byKey, match)) return byKey;
  }

  return undefined;
}

function resolveMatchMyPhotoRow(match: Match, myPhotos: MyPhoto[]): MyPhoto | undefined {
  if (match.myPhotoUploadedAt?.trim()) {
    const exact = myPhotos.find((p) =>
      uploadTimesEqual(p.uploadedAt, match.myPhotoUploadedAt),
    );
    if (exact) return exact;
  }
  const atSwipe = pickMyPhotoAtSwipeTime(myPhotos, match.timestamp);
  if (atSwipe) return atSwipe;
  const storedId = match.myPhotoId?.trim();
  if (storedId) {
    const fromStored = myPhotos.find((p) => p.backendId?.trim() === storedId);
    if (fromStored && myPhotoRowValidForMatch(fromStored, match)) return fromStored;
  }
  return findMyPhotoForMatch(match, myPhotos);
}

function voterIdValidForMatch(
  voterId: string,
  match: Match,
  myPhotos: MyPhoto[],
): boolean {
  const row = myPhotos.find((p) => p.backendId?.trim() === voterId.trim());
  if (!row) return true;
  return myPhotoRowValidForMatch(row, match);
}

function resolveMatchVoterPhotoId(
  match: Match,
  myPhotos: MyPhoto[],
  voterMap: Record<string, string>,
): string | undefined {
  const mapId = voterMap[match.theirPhotoId ?? ""]?.trim();
  const storedId = match.myPhotoId?.trim();
  const uploadedAt = match.myPhotoUploadedAt?.trim();

  if (uploadedAt) {
    const byTime = myPhotos.find((p) => uploadTimesEqual(p.uploadedAt, uploadedAt));
    if (byTime?.backendId?.trim()) return byTime.backendId.trim();
  }

  const atSwipe = pickMyPhotoAtSwipeTime(myPhotos, match.timestamp);
  if (atSwipe?.backendId?.trim()) return atSwipe.backendId.trim();

  const mapOk = mapId ? voterIdValidForMatch(mapId, match, myPhotos) : false;
  const storedOk = storedId ? voterIdValidForMatch(storedId, match, myPhotos) : false;

  if (mapId && storedId) {
    if (mapId === storedId) return mapId;
    if (mapOk && !storedOk) return mapId;
    if (storedOk && !mapOk) return storedId;
    return mapId;
  }
  if (mapId && mapOk) return mapId;
  if (storedId && storedOk) return storedId;
  return mapId || storedId;
}

function enrichMatchMyPhotoFields(match: Match, myPhotos: MyPhoto[]): Match {
  const row = resolveMatchMyPhotoRow(match, myPhotos);
  const photoId = row?.backendId?.trim();
  const fromLib = row ? resolveMyPhotoDisplayUri(row) : "";

  if (photoId) {
    const server = serverPhotoImageUrl(photoId);
    const current = match.myPhoto?.trim() ?? "";
    const currentOk = photoUriMatchesVoterId(current, photoId, myPhotos);
    const nextPhoto = fromLib.trim() || (currentOk ? current : "") || server;
    return {
      ...match,
      myPhotoId: photoId,
      myPhoto: nextPhoto,
      myPhotoUploadedAt: match.myPhotoUploadedAt || row?.uploadedAt,
    };
  }

  const bid = row?.backendId?.trim();
  if (!bid) return match;
  return {
    ...match,
    myPhotoId: bid,
    myPhoto: fromLib.trim() || serverPhotoImageUrl(bid),
    myPhotoUploadedAt: match.myPhotoUploadedAt || row?.uploadedAt,
  };
}

function resolveMatchMyPhotoThumbnailUri(
  match: Match,
  myPhotos: MyPhoto[],
): string {
  const row = resolveMatchMyPhotoRow(match, myPhotos);
  if (row) return resolveMyPhotoDisplayUri(row);

  const voterId = match.myPhotoId?.trim();
  if (voterId) {
    for (const candidate of [match.myPhoto]) {
      const c = candidate?.trim() ?? "";
      if (
        c.startsWith("file:") &&
        photoUriMatchesVoterId(c, voterId, myPhotos)
      ) {
        return c;
      }
    }
    return serverPhotoImageUrl(voterId, 320);
  }

  const fromLibrary = findMyPhotoForMatch(match, myPhotos);
  if (fromLibrary) return resolveMyPhotoDisplayUri(fromLibrary);
  return "";
}

function resolveEchoPhotoUri(
  side: { id?: string; uri?: string | null },
  myPhotos?: MyPhoto[],
): string {
  const uri = side.uri?.trim() ?? "";
  const id = side.id?.trim();
  if (uri && (uri.startsWith("file:") || uri.startsWith("content:"))) {
    if (id && myPhotos?.length && !photoUriMatchesVoterId(uri, id, myPhotos)) {
      return serverPhotoImageUrl(id);
    }
    return uri;
  }
  if (id) return serverPhotoImageUrl(id);
  return uri;
}

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const oldPhoto: MyPhoto = {
  uri: "file:///data/user/0/com.samewave.app/files/my-photos/old-local.jpg",
  uploadedAt: "2026-06-01T10:00:00.000Z",
  backendId: "photo-old",
};

const midPhoto: MyPhoto = {
  uri: "file:///data/user/0/com.samewave.app/files/my-photos/mid-local.jpg",
  uploadedAt: "2026-07-01T10:00:00.000Z",
  backendId: "photo-mid",
};

const newPhoto: MyPhoto = {
  uri: "file:///data/user/0/com.samewave.app/files/my-photos/new-local.jpg",
  uploadedAt: "2026-07-05T14:00:00.000Z",
  backendId: "photo-new",
};

const library = [newPhoto, midPhoto, oldPhoto];

const oldRipple: Match = {
  myPhotoId: "photo-old",
  myPhotoUploadedAt: "2026-06-01T10:00:00.000Z",
  timestamp: "2026-06-01T12:00:00.000Z",
  myPhoto: newPhoto.uri,
};

assert(
  "old ripple resolves old library row by id",
  findMyPhotoForMatch(oldRipple, library)?.backendId === "photo-old",
);

assert(
  "wrong myPhoto uri does not override upload time when id missing",
  findMyPhotoForMatch(
    {
      myPhotoUploadedAt: "2026-06-01T10:00:00.000Z",
      timestamp: "2026-06-01T12:00:00.000Z",
      myPhoto: newPhoto.uri,
    },
    library,
  )?.backendId === "photo-old",
);

assert(
  "known missing id does not fall back to newest",
  findMyPhotoForMatch({ ...oldRipple, myPhotoId: "photo-missing" }, library)
    ?.backendId === "photo-old",
);

const corruptedOldRipple: Match = {
  myPhotoId: "photo-new",
  timestamp: "2026-06-01T12:00:00.000Z",
  myPhoto: serverPhotoImageUrl("photo-new"),
};

const corruptedMidRipple: Match = {
  myPhotoId: "photo-new",
  timestamp: "2026-07-03T12:00:00.000Z",
  myPhoto: serverPhotoImageUrl("photo-new"),
};

assert(
  "swipe time beats corrupted newest id for early ripple",
  resolveMatchMyPhotoRow(corruptedOldRipple, library)?.backendId === "photo-old",
);

assert(
  "swipe time beats corrupted newest id for mid ripple",
  resolveMatchMyPhotoRow(corruptedMidRipple, library)?.backendId === "photo-mid",
);

const oldThumb = resolveMatchMyPhotoThumbnailUri(oldRipple, library);
const midThumb = resolveMatchMyPhotoThumbnailUri(corruptedMidRipple, library);
const newThumb = resolveMatchMyPhotoThumbnailUri(
  {
    myPhotoId: "photo-new",
    myPhotoUploadedAt: "2026-07-05T14:00:00.000Z",
    timestamp: "2026-07-05T14:30:00.000Z",
  },
  library,
);

assert(
  "waves old ripple thumb uses verified local not newest",
  oldThumb.includes("old-local.jpg"),
  oldThumb,
);

assert(
  "waves mid ripple thumb uses mid local not newest",
  midThumb.includes("mid-local.jpg"),
  midThumb,
);

assert(
  "waves new ripple thumb uses photo-new",
  photoUriMatchesVoterId(newThumb, "photo-new", library),
  newThumb,
);

assert(
  "old mid and new ripples resolve different thumbs",
  new Set([oldThumb, midThumb, newThumb]).size === 3,
);

const enrichedOld = enrichMatchMyPhotoFields(corruptedOldRipple, library);
const enrichedMid = enrichMatchMyPhotoFields(corruptedMidRipple, library);

assert(
  "enrich fixes corrupted early ripple to old photo",
  enrichedOld.myPhotoId === "photo-old" && enrichedOld.myPhoto.includes("old-local"),
  enrichedOld.myPhoto,
);

assert(
  "enrich fixes corrupted mid ripple to mid photo",
  enrichedMid.myPhotoId === "photo-mid" && enrichedMid.myPhoto.includes("mid-local"),
  enrichedMid.myPhoto,
);

assert(
  "echo rejects mismatched local for old voter id",
  resolveEchoPhotoUri({ id: "photo-old", uri: newPhoto.uri }, library).includes(
    "/api/photos/photo-old/image",
  ),
);

assert(
  "echo keeps matching local for new voter id",
  resolveEchoPhotoUri({ id: "photo-new", uri: newPhoto.uri }, library) ===
    newPhoto.uri,
);

const voterMap = { "their-old": "photo-old", "their-new": "photo-new" };
assert(
  "voter map beats journey-corrupted stored myPhotoId when swipe agrees",
  resolveMatchVoterPhotoId(
    {
      ...oldRipple,
      myPhotoId: "photo-new",
      theirPhotoId: "their-old",
      timestamp: "2026-06-01T12:00:00.000Z",
    },
    library,
    voterMap,
  ) === "photo-old",
);

assert(
  "stored newest id rejected when swipe predates that upload",
  resolveMatchVoterPhotoId(
    corruptedOldRipple,
    library,
    {},
  ) === "photo-old",
);

console.log("Done. exitCode=", process.exitCode ?? 0);
