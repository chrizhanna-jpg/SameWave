import type { Match, MyPhoto } from "@/context/AppContext";
import { getPublicApiOrigin, isLocalDevApiOrigin } from "@/utils/publicEnv";
import { resolveMatchPhotoUris, pickDurablePhotoUri } from "@/utils/matchPhotoSnapshot";
import { photoKey } from "@/utils/photoKey";
import { lookupVoterPhotoForMatchSync } from "@/utils/voterPhotoByTarget";
import { matchCountryFieldsFromCapture } from "@/utils/photoCountry";
import { isSamplePhoto } from "@/data/samplePhotos";
import {
  isPersistentPhotoUri,
} from "@/utils/localPhotoPaths";
import {
  persistentUriForPhoto,
  setDocumentDirectoryForTests,
} from "@/utils/myPhotoLocalUri";

export { setDocumentDirectoryForTests } from "@/utils/myPhotoLocalUri";
import {
  DISPLAY_PHOTO_MAX_WIDTH,
  FEED_THUMB_WIDTH,
  HERO_DISPLAY_WIDTH,
} from "@/constants/imageLoading";

export {
  DISPLAY_PHOTO_MAX_WIDTH,
  FEED_THUMB_WIDTH,
  HERO_DISPLAY_WIDTH,
} from "@/constants/imageLoading";

/** Authenticated stream URL for a server photo row. */
export function serverPhotoImageUrl(
  photoId: string,
  maxWidth: number = DISPLAY_PHOTO_MAX_WIDTH,
): string {
  return serverPhotoImageUrlAtOrigin(photoId, getPublicApiOrigin(), maxWidth);
}

/** Same as {@link serverPhotoImageUrl} but pinned to a specific API origin. */
export function serverPhotoImageUrlAtOrigin(
  photoId: string,
  origin: string,
  maxWidth: number = DISPLAY_PHOTO_MAX_WIDTH,
): string {
  const id = photoId.trim();
  if (!id) return "";
  const base = origin.replace(/\/$/, "");
  const url = `${base}/api/photos/${encodeURIComponent(id)}/image`;
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return url;
  return `${url}?w=${Math.round(maxWidth)}`;
}

/** Append display width to an existing `/api/photos/:id/image` URL if missing. */
export function withDisplayPhotoWidth(
  uri: string,
  maxWidth: number = DISPLAY_PHOTO_MAX_WIDTH,
): string {
  const trimmed = uri.trim();
  if (!trimmed || !/\/api\/photos\/[^/]+\/image/.test(trimmed)) return trimmed;
  if (/[?&]w=\d+/.test(trimmed)) return trimmed;
  const w = Math.round(maxWidth);
  return trimmed.includes("?") ? `${trimmed}&w=${w}` : `${trimmed}?w=${w}`;
}

/** Extract backend photo id from any `/api/photos/:id/image` reference. */
export function extractPhotoStreamId(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/\/api\/photos\/([^/?#]+)\/image(?:[/?#]|$)/);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return m[1].trim() || null;
  }
}

/**
 * Re-pin authed stream URLs to the current API origin. Persisted rows often
 * keep stale LAN dev hosts (`http://192.168.x.x:8787/...`) that fail on
 * device while Unsplash stock URLs still load.
 */
export function shouldCanonicalizePhotoStreamUri(uri: string): boolean {
  const trimmed = uri.trim();
  if (!trimmed || !extractPhotoStreamId(trimmed)) return false;
  if (trimmed.startsWith("/api/photos/")) return true;
  try {
    const parsed = new URL(
      trimmed.includes("://") ? trimmed : `https://placeholder${trimmed}`,
    );
    return isLocalDevApiOrigin(parsed.origin);
  } catch {
    return false;
  }
}

export function canonicalizePhotoStreamUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;
  if (!shouldCanonicalizePhotoStreamUri(trimmed)) return trimmed;
  const id = extractPhotoStreamId(trimmed);
  if (!id) return trimmed;
  try {
    const parsed = new URL(
      trimmed.includes("://") ? trimmed : `https://placeholder${trimmed}`,
    );
    const wRaw = parsed.searchParams.get("w");
    const w = wRaw ? parseInt(wRaw, 10) : DISPLAY_PHOTO_MAX_WIDTH;
    return serverPhotoImageUrl(
      id,
      Number.isFinite(w) && w > 0 ? w : DISPLAY_PHOTO_MAX_WIDTH,
    );
  } catch {
    return serverPhotoImageUrl(id);
  }
}

/** Authenticated fallback when a local `file://` capture is gone. */
export function photoStreamFallbackUri(
  photoId: string | undefined | null,
  maxWidth: number = DISPLAY_PHOTO_MAX_WIDTH,
): string | undefined {
  const id = photoId?.trim();
  return id ? serverPhotoImageUrl(id, maxWidth) : undefined;
}

const RECENT_PHOTO_THUMB_WIDTH = 320;

/** Smaller stream for recent-photo picker thumbnails. */
export function resolveMyPhotoThumbnailUri(
  photo: Pick<MyPhoto, "uri" | "backendId" | "uploadState" | "localId">,
): string {
  const local = photo.uri?.trim() ?? "";
  const persistentThumb = persistentUriForPhoto(photo, "thumb");
  const persistentFull = persistentUriForPhoto(photo, "full");
  if (persistentThumb) return persistentThumb;
  if (local && isPersistentPhotoUri(local)) return local;
  if (persistentFull) return persistentFull;
  if (local.startsWith("file:") || local.startsWith("content:")) return local;
  const bid =
    photo.backendId?.trim() || extractPhotoStreamId(local) || undefined;
  if (bid) return serverPhotoImageUrl(bid, RECENT_PHOTO_THUMB_WIDTH);
  if (
    local.startsWith("http://") ||
    local.startsWith("https://") ||
    local.startsWith("/api/photos/")
  ) {
    return canonicalizePhotoStreamUri(local);
  }
  return local;
}

/**
 * Alternate source when the primary display URI fails to decode/load.
 * Local captures are primary; authed server streams are the fallback.
 */
export function resolveMyPhotoFallbackUri(
  photo: Pick<MyPhoto, "uri" | "backendId" | "localId">,
  maxWidth: number = DISPLAY_PHOTO_MAX_WIDTH,
): string | undefined {
  const primary = resolveMyPhotoDisplayUri(photo);
  const bid = photo.backendId?.trim();
  const server = bid ? serverPhotoImageUrl(bid, maxWidth) : "";
  const persistent = persistentUriForPhoto(photo, "full");
  const thumb = persistentUriForPhoto(photo, "thumb");
  for (const candidate of [server, persistent, thumb]) {
    const c = candidate?.trim() ?? "";
    if (c && c !== primary) return c;
  }
  return server || undefined;
}

/** Stable unique key for recent-photo rows (duplicate backendIds can exist). */
export function myPhotoRowKey(
  photo: Pick<MyPhoto, "backendId" | "uploadedAt" | "uri">,
  index: number,
): string {
  const bid = photo.backendId?.trim();
  if (bid) return `bid:${bid}:${index}`;
  const at = photo.uploadedAt?.trim();
  if (at) return `at:${at}:${index}`;
  const uri = photo.uri?.trim();
  if (uri) return `uri:${uri}:${index}`;
  return `idx:${index}`;
}

/** True when a display uri belongs to the given voter backend photo id. */
export function photoUriMatchesVoterId(
  uri: string,
  voterId: string,
  myPhotos: MyPhoto[],
): boolean {
  const trimmed = uri.trim();
  const id = voterId.trim();
  if (!trimmed || !id) return false;
  const fromStream = extractPhotoStreamId(trimmed);
  if (fromStream === id) return true;
  const row = myPhotos.find((p) => p.backendId?.trim() === id);
  if (!row) return false;
  const expected = resolveMyPhotoDisplayUri(row);
  const key = photoKey(trimmed);
  const expectedKey = photoKey(expected);
  if (key && expectedKey) return key === expectedKey;
  return trimmed === expected;
}

function uriHintMatchesMatch(
  photo: MyPhoto,
  match: Pick<
    Match,
    "myPhotoId" | "myPhotoUploadedAt" | "timestamp"
  >,
): boolean {
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

function isOfflineSafePhotoUri(uri: string): boolean {
  const trimmed = uri.trim();
  if (!trimmed) return false;
  return (
    isPersistentPhotoUri(trimmed) ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:") ||
    trimmed.startsWith("data:")
  );
}

/** Verified on-device capture for a voter id — never another upload's file. */
function verifiedLocalForVoterId(
  voterId: string,
  match: Pick<Match, "myPhoto">,
  myPhotos: MyPhoto[],
  stashed?: string,
): string {
  const id = voterId.trim();
  if (!id) return "";
  const row = myPhotos.find((p) => p.backendId?.trim() === id);
  if (row) {
    for (const candidate of [
      resolveMyPhotoDisplayUri(row),
      resolveMyPhotoThumbnailUri(row),
    ]) {
      if (
        candidate.trim() &&
        isOfflineSafePhotoUri(candidate) &&
        photoUriMatchesVoterId(candidate, id, myPhotos)
      ) {
        return candidate;
      }
    }
  }
  for (const candidate of [match.myPhoto, stashed]) {
    const c = candidate?.trim() ?? "";
    if (c && isOfflineSafePhotoUri(c) && photoUriMatchesVoterId(c, id, myPhotos)) {
      return c;
    }
  }
  return "";
}

/** Echo / wave card side — prefer durable local uri, fall back to authenticated stream. */
export function resolveEchoPhotoUri(
  side: {
    id?: string;
    uri?: string | null;
  },
  myPhotos?: MyPhoto[],
): string {
  const uri = side.uri?.trim() ?? "";
  const id = side.id?.trim();
  if (
    uri &&
    (isPersistentPhotoUri(uri) ||
      uri.startsWith("file:") ||
      uri.startsWith("content:"))
  ) {
    if (id && myPhotos?.length && !photoUriMatchesVoterId(uri, id, myPhotos)) {
      return serverPhotoImageUrl(id);
    }
    return uri;
  }
  if (uri.length > 0 && !uri.startsWith("file:") && !uri.startsWith("content:")) {
    if (id && myPhotos?.length) {
      const streamId = extractPhotoStreamId(uri);
      if (streamId && streamId !== id) {
        return serverPhotoImageUrl(id);
      }
    }
    return canonicalizePhotoStreamUri(uri);
  }
  if (id) return serverPhotoImageUrl(id);
  return uri;
}

export function uploadTimesEqual(a?: string, b?: string): boolean {
  const sa = a?.trim() ?? "";
  const sb = b?.trim() ?? "";
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const ta = Date.parse(sa);
  const tb = Date.parse(sb);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

/** Best backend id for the voter photo at swipe time (today's upload preferred). */
export function pickVoterPhotoBackendId(
  myPhotos: MyPhoto[],
  opts?: { uploadedAt?: string; preferUri?: string },
): string | undefined {
  const preferUri = opts?.preferUri?.trim();
  if (preferUri) {
    const hit = myPhotos.find(
      (p) => p.uri === preferUri || resolveMyPhotoDisplayUri(p) === preferUri,
    );
    const bid = hit?.backendId?.trim();
    if (bid) return bid;
  }

  const uploadedAt = opts?.uploadedAt?.trim();
  if (uploadedAt) {
    const exact = myPhotos.find((p) => uploadTimesEqual(p.uploadedAt, uploadedAt));
    const bid = exact?.backendId?.trim();
    if (bid) return bid;
  }

  const todayUtcDay = Math.floor(Date.now() / 86_400_000);
  const newest = myPhotos[0];
  if (newest?.backendId?.trim()) {
    const day = Math.floor(new Date(newest.uploadedAt).getTime() / 86_400_000);
    if (day === todayUtcDay) return newest.backendId.trim();
  }

  for (const p of myPhotos) {
    const bid = p.backendId?.trim();
    if (bid && p.uploadState !== "failed") return bid;
  }
  return undefined;
}

/** Pick the voter photo id for a ripple — per-target map beats corrupted stored ids. */
export function resolveMatchVoterPhotoId(
  match: Pick<
    Match,
    "myPhotoId" | "theirPhotoId" | "theirPhoto" | "myPhotoUploadedAt" | "timestamp"
  >,
  myPhotos?: MyPhoto[],
): string | undefined {
  const mapId = lookupVoterPhotoForMatchSync(match)?.trim();
  const storedId = match.myPhotoId?.trim();
  if (!myPhotos?.length) return storedId || mapId || undefined;
  return reconcileVoterPhotoId({ mapId, storedId, match, myPhotos });
}

function reconcileVoterPhotoId(args: {
  mapId?: string;
  storedId?: string;
  match: Pick<Match, "myPhotoUploadedAt" | "timestamp">;
  myPhotos: MyPhoto[];
}): string | undefined {
  const { mapId, storedId, match, myPhotos } = args;
  const uploadedAt = match.myPhotoUploadedAt?.trim();

  const idMatchesUpload = (id: string): boolean => {
    if (!uploadedAt) return true;
    return myPhotos.some(
      (p) => p.backendId?.trim() === id && uploadTimesEqual(p.uploadedAt, uploadedAt),
    );
  };

  if (mapId && storedId) {
    if (mapId === storedId) return mapId;
    const mapOk = idMatchesUpload(mapId);
    const storedOk = idMatchesUpload(storedId);
    if (mapOk && !storedOk) return mapId;
    if (storedOk && !mapOk) return storedId;
    // Per-target voter map wins when both or neither match upload metadata.
    return mapId;
  }

  if (mapId) return mapId;

  if (storedId) {
    if (uploadedAt && !idMatchesUpload(storedId)) {
      const byTime = myPhotos.find((p) =>
        uploadTimesEqual(p.uploadedAt, uploadedAt),
      );
      if (byTime?.backendId?.trim()) return byTime.backendId.trim();
    }
    return storedId;
  }

  if (uploadedAt) {
    const byTime = myPhotos.find((p) =>
      uploadTimesEqual(p.uploadedAt, uploadedAt),
    );
    if (byTime?.backendId?.trim()) return byTime.backendId.trim();
  }

  const swipeAt = Date.parse(match.timestamp);
  if (Number.isFinite(swipeAt)) {
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
    if (best?.backendId?.trim()) return best.backendId.trim();
  }

  return undefined;
}

function matchForVoterPhotoLookup<
  T extends Pick<
    Match,
    "myPhoto" | "myPhotoId" | "myPhotoUploadedAt" | "timestamp" | "theirPhotoId" | "theirPhoto"
  >,
>(match: T, myPhotos: MyPhoto[]): T {
  const voterId = resolveMatchVoterPhotoId(match, myPhotos);
  if (!voterId || match.myPhotoId?.trim() === voterId) return match;
  return { ...match, myPhotoId: voterId };
}

/** Best-effort voter photo for a ripple row — id, upload time, or active-at-swipe. */
export function findMyPhotoForMatch(
  match: Pick<
    Match,
    "myPhoto" | "myPhotoId" | "myPhotoUploadedAt" | "timestamp"
  >,
  myPhotos: MyPhoto[],
  stashedMyPhoto?: string,
): MyPhoto | undefined {
  const photoId = match.myPhotoId?.trim();
  if (photoId) {
    return myPhotos.find((p) => p.backendId?.trim() === photoId);
  }

  if (match.myPhotoUploadedAt) {
    const uploadedAt = match.myPhotoUploadedAt.trim();
    const exact = myPhotos.find((p) => uploadTimesEqual(p.uploadedAt, uploadedAt));
    if (exact) return exact;
  }

  const swipeAt = Date.parse(match.timestamp);
  if (Number.isFinite(swipeAt)) {
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
    if (best) return best;
  }

  const uriHints = [stashedMyPhoto, match.myPhoto].filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  for (const hint of uriHints) {
    const key = photoKey(hint);
    if (!key) continue;
    const byKey = myPhotos.find(
      (p) => photoKey(p.uri) === key || photoKey(resolveMyPhotoDisplayUri(p)) === key,
    );
    if (byKey && uriHintMatchesMatch(byKey, match)) return byKey;
  }

  return undefined;
}

function resolveMyPhotoForMatch(
  match: Pick<
    Match,
    "myPhoto" | "myPhotoId" | "myPhotoUploadedAt" | "timestamp"
  >,
  myPhotos: MyPhoto[],
  stashedMyPhoto?: string,
): string {
  const fromId = match.myPhotoId?.trim();
  if (fromId) return serverPhotoImageUrl(fromId);

  const persisted = pickDurablePhotoUri(match.myPhoto, stashedMyPhoto);
  if (persisted) return persisted;

  const fromLibrary = findMyPhotoForMatch(match, myPhotos, stashedMyPhoto);
  if (fromLibrary) return resolveMyPhotoDisplayUri(fromLibrary);

  return "";
}

/** Resolve the viewer's photo for a sent-ripple / match row. */
export function resolveMatchMyPhotoUri(
  match: Pick<
    Match,
    | "id"
    | "myPhoto"
    | "myPhotoId"
    | "myPhotoUploadedAt"
    | "timestamp"
    | "theirPhotoId"
    | "theirPhoto"
  >,
  myPhotos: MyPhoto[],
): string {
  const lookup = matchForVoterPhotoLookup(match, myPhotos);
  const voterId = resolveMatchVoterPhotoId(lookup, myPhotos);
  const stashed = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;

  if (voterId) {
    const local = verifiedLocalForVoterId(voterId, match, myPhotos, stashed);
    if (local) {
      return resolveEchoPhotoUri({ id: voterId, uri: local }, myPhotos);
    }
    for (const candidate of [match.myPhoto, stashed]) {
      const c = candidate?.trim() ?? "";
      if (c && photoUriMatchesVoterId(c, voterId, myPhotos)) {
        return resolveEchoPhotoUri({ id: voterId, uri: c }, myPhotos);
      }
    }
    return serverPhotoImageUrl(voterId);
  }

  const fromLibrary = findMyPhotoForMatch(lookup, myPhotos, stashed);
  if (fromLibrary) {
    const libUri = resolveMyPhotoDisplayUri(fromLibrary);
    if (libUri.trim()) return libUri;
  }

  let myPhoto = pickDurablePhotoUri(match.myPhoto, stashed);
  if (!myPhoto || myPhoto.startsWith("file:")) {
    myPhoto = resolveMyPhotoForMatch(lookup, myPhotos, stashed);
  }

  return resolveEchoPhotoUri({ uri: myPhoto }, myPhotos);
}

/** Thumbnail-sized voter photo for feed tiles (320w stream). */
export function resolveMatchMyPhotoThumbnailUri(
  match: Pick<
    Match,
    | "id"
    | "myPhoto"
    | "myPhotoId"
    | "myPhotoUploadedAt"
    | "timestamp"
    | "theirPhotoId"
    | "theirPhoto"
  >,
  myPhotos: MyPhoto[],
): string {
  const lookup = matchForVoterPhotoLookup(match, myPhotos);
  const voterId = resolveMatchVoterPhotoId(lookup, myPhotos);
  const stashed = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;

  if (voterId) {
    const local = verifiedLocalForVoterId(voterId, match, myPhotos, stashed);
    if (local) return local;
    return serverPhotoImageUrl(voterId, FEED_THUMB_WIDTH);
  }

  const fromLibrary = findMyPhotoForMatch(lookup, myPhotos, stashed);
  if (fromLibrary) {
    const thumb = resolveMyPhotoThumbnailUri(fromLibrary);
    if (thumb.trim()) return thumb;
  }

  const uri = resolveMatchMyPhotoUri(match, myPhotos);
  if (!uri || uri.startsWith("file:") || uri.startsWith("content:")) {
    return uri;
  }
  const id = extractPhotoStreamId(uri) || undefined;
  if (id && !isSamplePhoto(uri)) {
    return serverPhotoImageUrl(id, FEED_THUMB_WIDTH);
  }
  return withDisplayPhotoWidth(uri, FEED_THUMB_WIDTH);
}

/** Local or thumbnail fallback when the primary stream fails in a feed row. */
export function resolveMatchMyPhotoFallbackUri(
  match: Pick<
    Match,
    | "id"
    | "myPhoto"
    | "myPhotoId"
    | "myPhotoUploadedAt"
    | "timestamp"
    | "theirPhotoId"
    | "theirPhoto"
  >,
  myPhotos: MyPhoto[],
): string | undefined {
  const lookup = matchForVoterPhotoLookup(match, myPhotos);
  const voterId = resolveMatchVoterPhotoId(lookup, myPhotos);
  const stashed = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;

  if (voterId) {
    const local = verifiedLocalForVoterId(voterId, match, myPhotos, stashed);
    const server = serverPhotoImageUrl(voterId, FEED_THUMB_WIDTH);
    if (local) return server;
    const row = findMyPhotoForMatch(lookup, myPhotos, stashed);
    if (row) {
      const alt = resolveMyPhotoFallbackUri(row, FEED_THUMB_WIDTH);
      if (alt?.trim() && alt !== server) return alt;
    }
    return server;
  }

  const row = findMyPhotoForMatch(lookup, myPhotos, stashed);
  if (row) {
    const alt = resolveMyPhotoFallbackUri(row, FEED_THUMB_WIDTH);
    if (alt?.trim()) return alt;
  }
  return photoStreamFallbackUri(resolveMatchVoterPhotoId(match, myPhotos), FEED_THUMB_WIDTH);
}

/** Match row photos for lists — survives stripped cache and stale file:// captures. */
export function resolveMatchPhotoDisplay(
  match: Pick<
    Match,
    | "id"
    | "myPhoto"
    | "theirPhoto"
    | "theirPhotoId"
    | "myPhotoId"
    | "myPhotoUploadedAt"
    | "timestamp"
  >,
  myPhotos: MyPhoto[],
): { myPhoto: string; theirPhoto: string } {
  const myPhoto = resolveMatchMyPhotoUri(match, myPhotos);

  const enriched = enrichMatchMyPhotoFields(match as Match, myPhotos);
  const stashed = resolveMatchPhotoUris(enriched.id, {
    myPhoto: enriched.myPhoto,
    theirPhoto: enriched.theirPhoto,
  });

  let theirPhoto = pickDurablePhotoUri(
    enriched.theirPhotoId ? serverPhotoImageUrl(enriched.theirPhotoId) : "",
    enriched.theirPhoto,
    stashed.theirPhoto,
  );
  if (!theirPhoto || theirPhoto.startsWith("file:")) {
    const id = enriched.theirPhotoId?.trim();
    if (id) theirPhoto = serverPhotoImageUrl(id);
    else theirPhoto = "";
  }

  return { myPhoto, theirPhoto };
}

/** Pick the display URI to store on a match row — local-first, id in myPhotoId. */
export function pickMatchMyPhotoDisplayUri(
  match: Pick<
    Match,
    | "id"
    | "myPhoto"
    | "myPhotoId"
    | "myPhotoUploadedAt"
    | "timestamp"
    | "theirPhotoId"
    | "theirPhoto"
  >,
  myPhotos: MyPhoto[],
  preferUri?: string,
): string {
  const stashed = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;
  const lookup = matchForVoterPhotoLookup(match, myPhotos);
  const row = findMyPhotoForMatch(lookup, myPhotos, stashed);
  if (row) {
    const fromLib = resolveMyPhotoDisplayUri(row);
    if (fromLib.trim()) return fromLib;
  }
  const hint = preferUri?.trim() || match.myPhoto?.trim() || stashed?.trim() || "";
  if (
    hint &&
    (isPersistentPhotoUri(hint) ||
      hint.startsWith("file:") ||
      hint.startsWith("content:") ||
      (!hint.includes("/api/photos/") && !shouldCanonicalizePhotoStreamUri(hint)))
  ) {
    const voterId = resolveMatchVoterPhotoId(match, myPhotos);
    if (!voterId || photoUriMatchesVoterId(hint, voterId, myPhotos)) return hint;
  }
  const bid = resolveMatchVoterPhotoId(match, myPhotos) || row?.backendId?.trim();
  return bid ? serverPhotoImageUrl(bid) : hint;
}

/** Backfill voter photo id + HTTPS uri on ripple rows after cache strip or late upload ack. */
export function enrichMatchMyPhotoFields(
  match: Match,
  myPhotos: MyPhoto[],
): Match {
  const stashedMyPhoto = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;
  const photoId = resolveMatchVoterPhotoId(match, myPhotos);
  const photo = findMyPhotoForMatch(
    photoId ? { ...match, myPhotoId: photoId } : match,
    myPhotos,
    stashedMyPhoto,
  );
  const fromLib =
    photo && (!photoId || photo.backendId?.trim() === photoId)
      ? resolveMyPhotoDisplayUri(photo)
      : "";

  if (photoId) {
    const server = serverPhotoImageUrl(photoId);
    const current = match.myPhoto?.trim() ?? "";
    const currentOk = photoUriMatchesVoterId(current, photoId, myPhotos);
    const stashedOk =
      !!stashedMyPhoto?.trim() &&
      photoUriMatchesVoterId(stashedMyPhoto, photoId, myPhotos);
    const needsId = match.myPhotoId?.trim() !== photoId;
    const nextPhoto =
      fromLib.trim() ||
      (currentOk ? current : "") ||
      (stashedOk ? stashedMyPhoto.trim() : "") ||
      server;
    if (needsId || nextPhoto !== current) {
      return { ...match, myPhotoId: photoId, myPhoto: nextPhoto };
    }
    return match;
  }

  const bid = photo?.backendId?.trim();
  if (!bid) {
    const durable = pickDurablePhotoUri(match.myPhoto, stashedMyPhoto);
    if (durable && durable !== match.myPhoto && !isSamplePhoto(durable)) {
      return { ...match, myPhoto: durable };
    }
    if (fromLib && fromLib !== match.myPhoto && !isSamplePhoto(fromLib)) {
      return { ...match, myPhoto: fromLib };
    }
    return match;
  }

  const server = serverPhotoImageUrl(bid);
  if (isSamplePhoto(server)) return match;
  return {
    ...match,
    myPhotoId: bid,
    myPhoto: fromLib.trim() || server,
  };
}

export type ResolveMyPhotoDisplayOptions = {
  /**
   * On Ripple, keep the in-app camera `file://` capture visible while
   * upload sync runs — switching straight to the authed server URL
   * flashes a loading spinner and makes the user's photo appear to vanish.
   */
  preferLocalCapture?: boolean;
};

/**
 * Prefer durable on-device copies for the viewer's own photos. Authed server
 * streams are used only when no local capture exists (legacy rows).
 */
export function resolveMyPhotoDisplayUri(
  photo: Pick<MyPhoto, "uri" | "backendId" | "uploadState" | "localId">,
  options?: ResolveMyPhotoDisplayOptions,
): string {
  void options;
  const local = photo.uri?.trim() ?? "";
  const persistent = persistentUriForPhoto(photo, "full");
  if (local && isPersistentPhotoUri(local)) return local;
  if (persistent) return persistent;
  if (local.startsWith("file:") || local.startsWith("content:")) return local;
  const bid =
    photo.backendId?.trim() || extractPhotoStreamId(local) || undefined;
  if (bid) return serverPhotoImageUrl(bid);
  if (
    local.startsWith("http://") ||
    local.startsWith("https://") ||
    local.startsWith("/api/photos/")
  ) {
    return canonicalizePhotoStreamUri(local);
  }
  return local;
}

/** Backfill backendId/uploadState and HTTPS uri on persisted myPhotos rows. */
export function repairMyPhotos(photos: MyPhoto[], matches: Match[]): MyPhoto[] {
  return photos.map((raw) => {
    let photo: MyPhoto = { ...raw };
    let bid =
      photo.backendId?.trim() ||
      extractPhotoStreamId(photo.uri?.trim() ?? "") ||
      undefined;

    if (!bid) {
      for (const m of matches) {
        const mid = m.myPhotoId?.trim();
        if (!mid) continue;
        if (uploadTimesEqual(m.myPhotoUploadedAt, photo.uploadedAt)) {
          bid = mid;
          break;
        }
      }
    }

    if (bid) {
      const patch: Partial<MyPhoto> = { backendId: bid };
      if (photo.uploadState !== "failed") {
        patch.uploadState = "ok";
      }
      photo = { ...photo, ...patch };
    }

    return hydrateMyPhotoUri(photo);
  });
}

/** Backfill persisted rows — keep durable local copies, never overwrite with server. */
export function hydrateMyPhotoUri(photo: MyPhoto): MyPhoto {
  const local = photo.uri?.trim() ?? "";
  const persistent = persistentUriForPhoto(photo, "full");
  if (local && isPersistentPhotoUri(local)) return photo;
  if (persistent) {
    if (
      !local ||
      local.startsWith("file:") ||
      local.startsWith("content:") ||
      local.includes("/api/photos/")
    ) {
      return { ...photo, uri: persistent };
    }
  }
  const bid = photo.backendId?.trim();
  if (bid && !local && !persistent) {
    return { ...photo, uri: serverPhotoImageUrl(bid) };
  }
  return photo;
}

/** Match a row by stored uri or authenticated display uri. */
export function findMyPhotoByUri(
  photos: MyPhoto[],
  uri: string,
): MyPhoto | undefined {
  const u = uri.trim();
  if (!u) return undefined;
  for (const p of photos) {
    if (p.uri === u) return p;
    if (resolveMyPhotoDisplayUri(p) === u) return p;
  }
  return undefined;
}

/** Enrich matches before persisting so stripped file:// rows keep HTTPS urls via myPhotoId. */
export function enrichMatchesForStorage(
  matches: Match[],
  myPhotos: MyPhoto[],
): Match[] {
  return matches.map((m) =>
    enrichMatchMyPhotoFields(
      { ...m, ...matchCountryFieldsFromCapture(m) },
      myPhotos,
    ),
  );
}
