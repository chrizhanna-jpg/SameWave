import type { Match, MyPhoto } from "@/context/AppContext";
import { getPublicApiOrigin } from "@/utils/publicEnv";
import { resolveMatchPhotoUris, pickDurablePhotoUri } from "@/utils/matchPhotoSnapshot";
import { photoKey } from "@/utils/photoKey";
import { lookupVoterPhotoForMatchSync } from "@/utils/voterPhotoByTarget";
import { matchCountryFieldsFromCapture } from "@/utils/photoCountry";

/** Authenticated stream URL for a server photo row. */
export function serverPhotoImageUrl(photoId: string): string {
  return serverPhotoImageUrlAtOrigin(photoId, getPublicApiOrigin());
}

/** Same as {@link serverPhotoImageUrl} but pinned to a specific API origin. */
export function serverPhotoImageUrlAtOrigin(
  photoId: string,
  origin: string,
): string {
  const id = photoId.trim();
  if (!id) return "";
  const base = origin.replace(/\/$/, "");
  return `${base}/api/photos/${encodeURIComponent(id)}/image`;
}

/** Echo / wave card side — prefer inline uri, fall back to authenticated stream. */
export function resolveEchoPhotoUri(side: {
  id?: string;
  uri?: string | null;
}): string {
  const uri = side.uri?.trim() ?? "";
  if (uri.length > 0 && !uri.startsWith("file:")) return uri;
  const id = side.id?.trim();
  if (id) return serverPhotoImageUrl(id);
  return uri;
}

function uploadTimesEqual(a?: string, b?: string): boolean {
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

  return (
    myPhotos.find((p) => !!p.backendId?.trim()) ??
    myPhotos.find((p) => !!p.uri?.trim())
  );
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
    if (durable && durable !== match.myPhoto) {
      return { ...match, myPhoto: durable };
    }
    const fromLib = photo ? resolveMyPhotoDisplayUri(photo) : "";
    if (fromLib && fromLib !== match.myPhoto) {
      return { ...match, myPhoto: fromLib };
    }
    return match;
  }

  const server = serverPhotoImageUrl(bid);
  return { ...match, myPhotoId: bid, myPhoto: server };
}

/**
 * Prefer the durable server image when we have a backend id — local
 * `file://` captures can be purged after the app sits in background.
 */
export function resolveMyPhotoDisplayUri(photo: Pick<MyPhoto, "uri" | "backendId">): string {
  const bid = photo.backendId?.trim();
  if (bid) return serverPhotoImageUrl(bid);
  return photo.uri?.trim() ?? "";
}

/** Backfill persisted rows that stripped `file://` but kept backendId. */
export function hydrateMyPhotoUri(photo: MyPhoto): MyPhoto {
  const bid = photo.backendId?.trim();
  if (!bid) return photo;
  const server = serverPhotoImageUrl(bid);
  const local = photo.uri?.trim() ?? "";
  if (!local || local.startsWith("file:")) {
    return { ...photo, uri: server };
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
