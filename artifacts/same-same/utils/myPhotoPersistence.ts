import type { MyPhoto } from "@/context/AppContext";
import {
  findMyPhotoByUri,
  hydrateMyPhotoUri,
  serverPhotoImageUrl,
} from "@/utils/photoDisplayUri";

/** Stable per-row id — survives uri rewrites after upload ack / hydration. */
export function createMyPhotoLocalId(): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += hex[(Math.random() * 4) | 0 | 8];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}

function photoRichnessScore(photo: MyPhoto): number {
  let score = 0;
  if (photo.backendId?.trim()) score += 8;
  if (photo.uploadState === "ok") score += 4;
  if (photo.uri?.trim()) score += 2;
  if (photo.localId?.trim()) score += 1;
  return score;
}

function pickRicherMyPhoto(a: MyPhoto, b: MyPhoto): MyPhoto {
  const sa = photoRichnessScore(a);
  const sb = photoRichnessScore(b);
  if (sb > sa) return { ...a, ...b, localId: a.localId ?? b.localId };
  return { ...b, ...a, localId: a.localId ?? b.localId };
}

/** Union photo rows — prefer backendId, upload ok, and in-memory uploads during hydration races. */
export function mergeMyPhotos(...groups: MyPhoto[][]): MyPhoto[] {
  const sorted = groups
    .flat()
    .map((p) => hydrateMyPhotoUri(p))
    .sort(
      (a, b) =>
        Date.parse(b.uploadedAt || "0") - Date.parse(a.uploadedAt || "0"),
    );
  const out: MyPhoto[] = [];
  for (const p of sorted) {
    const bid = p.backendId?.trim();
    if (bid) {
      const idx = out.findIndex((x) => x.backendId?.trim() === bid);
      if (idx >= 0) {
        out[idx] = pickRicherMyPhoto(out[idx], p);
        continue;
      }
    }
    const lid = p.localId?.trim();
    if (lid) {
      const idx = out.findIndex((x) => x.localId?.trim() === lid);
      if (idx >= 0) {
        out[idx] = pickRicherMyPhoto(out[idx], p);
        continue;
      }
    }
    const at = p.uploadedAt?.trim();
    if (at) {
      const idx = out.findIndex(
        (x) => !x.backendId?.trim() && x.uploadedAt?.trim() === at,
      );
      if (idx >= 0) {
        out[idx] = pickRicherMyPhoto(out[idx], p);
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Locate a myPhotos row for upload ack / state patches (uri often races storage). */
export function findMyPhotoRow(
  photos: MyPhoto[],
  hint: { uri?: string; localId?: string; uploadedAt?: string },
): MyPhoto | undefined {
  const lid = hint.localId?.trim();
  if (lid) {
    const byLocal = photos.find((p) => p.localId?.trim() === lid);
    if (byLocal) return byLocal;
  }
  const uri = hint.uri?.trim();
  if (uri) {
    const byUri = findMyPhotoByUri(photos, uri);
    if (byUri) return byUri;
    const exact = photos.find((p) => p.uri?.trim() === uri);
    if (exact) return exact;
  }
  const at = hint.uploadedAt?.trim();
  if (at) {
    const byAt = photos.find((p) => p.uploadedAt?.trim() === at);
    if (byAt) return byAt;
  }
  return photos.find(
    (p) =>
      p.uploadState === "pending" &&
      !p.backendId?.trim() &&
      !p.isAI,
  );
}

/** Rebuild library rows from match history when local rows lost backendId. */
export function myPhotosFromMatchHistory(
  matches: Array<{
    myPhotoId?: string | null;
    myPhotoUploadedAt?: string | null;
    theme?: string | null;
  }>,
): MyPhoto[] {
  const out: MyPhoto[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const bid = m.myPhotoId?.trim();
    const at = m.myPhotoUploadedAt?.trim();
    if (!bid || !at || seen.has(bid)) continue;
    seen.add(bid);
    out.push({
      uri: serverPhotoImageUrl(bid),
      backendId: bid,
      uploadedAt: at,
      theme: m.theme?.trim() || "joy",
      uploadState: "ok",
    });
  }
  return out;
}
