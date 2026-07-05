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

/** Echo / wave card side — prefer durable local uri, fall back to authenticated stream. */
export function resolveEchoPhotoUri(side: {
  id?: string;
  uri?: string | null;
}): string {
  const uri = side.uri?.trim() ?? "";
  if (
    uri &&
    (isPersistentPhotoUri(uri) ||
      uri.startsWith("file:") ||
      uri.startsWith("content:"))
  ) {
    return uri;
  }
  if (uri.length > 0 && !uri.startsWith("file:") && !uri.startsWith("content:")) {
    return canonicalizePhotoStreamUri(uri);
  }
  const id = side.id?.trim();
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
    const byId = myPhotos.find((p) => p.backendId?.trim() === photoId);
    if (byId) return byId;
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
    if (byKey) return byKey;
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
  >,
  myPhotos: MyPhoto[],
): string {
  const enriched = enrichMatchMyPhotoFields(match as Match, myPhotos);
  const stashed = resolveMatchPhotoUris(enriched.id, {
    myPhoto: enriched.myPhoto,
    theirPhoto: "",
  });

  const fromLibrary = findMyPhotoForMatch(enriched, myPhotos, stashed.myPhoto);
  if (fromLibrary) {
    const libUri = resolveMyPhotoDisplayUri(fromLibrary);
    if (libUri.trim()) return libUri;
  }

  let myPhoto = pickDurablePhotoUri(
    enriched.myPhotoId ? serverPhotoImageUrl(enriched.myPhotoId) : "",
    enriched.myPhoto,
    stashed.myPhoto,
  );
  if (!myPhoto || myPhoto.startsWith("file:")) {
    myPhoto = resolveMyPhotoForMatch(enriched, myPhotos, stashed.myPhoto);
  }

  return resolveEchoPhotoUri({ id: enriched.myPhotoId, uri: myPhoto });
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
  >,
  myPhotos: MyPhoto[],
): string {
  const stashed = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;
  const fromLibrary = findMyPhotoForMatch(match, myPhotos, stashed);
  if (fromLibrary) {
    const thumb = resolveMyPhotoThumbnailUri(fromLibrary);
    if (thumb.trim()) return thumb;
  }

  const uri = resolveMatchMyPhotoUri(match, myPhotos);
  if (!uri || uri.startsWith("file:") || uri.startsWith("content:")) {
    return uri;
  }
  const id = match.myPhotoId?.trim() || extractPhotoStreamId(uri) || undefined;
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
  >,
  myPhotos: MyPhoto[],
): string | undefined {
  const stashed = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;
  const row = findMyPhotoForMatch(match, myPhotos, stashed);
  if (row) {
    const alt = resolveMyPhotoFallbackUri(row, FEED_THUMB_WIDTH);
    if (alt?.trim()) return alt;
  }
  return photoStreamFallbackUri(match.myPhotoId, FEED_THUMB_WIDTH);
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

/** Backfill voter photo id + HTTPS uri on ripple rows after cache strip or late upload ack. */
export function enrichMatchMyPhotoFields(
  match: Match,
  myPhotos: MyPhoto[],
): Match {
  const stashedMyPhoto = resolveMatchPhotoUris(match.id, {
    myPhoto: match.myPhoto,
    theirPhoto: "",
  }).myPhoto;
  let photoId = match.myPhotoId?.trim();
  if (!photoId) {
    const fromTarget = lookupVoterPhotoForMatchSync(match);
    if (fromTarget) photoId = fromTarget;
  }
  if (photoId) {
    const server = serverPhotoImageUrl(photoId);
    const current = match.myPhoto?.trim() ?? "";
    const needsId = match.myPhotoId?.trim() !== photoId;
    if (!current || current.startsWith("file:") || needsId) {
      return { ...match, myPhotoId: photoId, myPhoto: server };
    }
    return match;
  }

  const photo = findMyPhotoForMatch(match, myPhotos, stashedMyPhoto);
  const bid = photo?.backendId?.trim();
  if (!bid) {
    const durable = pickDurablePhotoUri(match.myPhoto, stashedMyPhoto);
    if (durable && durable !== match.myPhoto && !isSamplePhoto(durable)) {
      return { ...match, myPhoto: durable };
    }
    const fromLib = photo ? resolveMyPhotoDisplayUri(photo) : "";
    if (fromLib && fromLib !== match.myPhoto && !isSamplePhoto(fromLib)) {
      return { ...match, myPhoto: fromLib };
    }
    return match;
  }

  const server = serverPhotoImageUrl(bid);
  if (isSamplePhoto(server)) return match;
  return { ...match, myPhotoId: bid, myPhoto: server };
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
