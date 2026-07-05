/**
 * Each ripple row must keep its own voter photo — not today's newest upload.
 * Run: pnpm exec tsx scripts/test-waves-voter-photo.ts
 */

function uploadTimesEqual(a?: string, b?: string): boolean {
  const sa = a?.trim() ?? "";
  const sb = b?.trim() ?? "";
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const ta = Date.parse(sa);
  const tb = Date.parse(sb);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

type MyPhoto = {
  uri: string;
  uploadedAt: string;
  backendId?: string;
};

type Match = {
  myPhotoId?: string;
  myPhotoUploadedAt?: string;
  timestamp: string;
};

/** Mirrors fixed findMyPhotoForMatch — no fallthrough when photoId is set. */
function findMyPhotoForMatch(match: Match, myPhotos: MyPhoto[]): MyPhoto | undefined {
  const photoId = match.myPhotoId?.trim();
  if (photoId) {
    return myPhotos.find((p) => p.backendId?.trim() === photoId);
  }
  if (match.myPhotoUploadedAt) {
    const exact = myPhotos.find((p) =>
      uploadTimesEqual(p.uploadedAt, match.myPhotoUploadedAt),
    );
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
    return best;
  }
  return undefined;
}

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const oldPhoto: MyPhoto = {
  uri: "https://samewave.onrender.com/api/photos/photo-old/image",
  uploadedAt: "2026-06-01T10:00:00.000Z",
  backendId: "photo-old",
};

const newPhoto: MyPhoto = {
  uri: "file:///data/user/0/com.samewave.app/files/my-photos/new-local.jpg",
  uploadedAt: "2026-07-05T14:00:00.000Z",
  backendId: "photo-new",
};

const library = [newPhoto, oldPhoto];

const oldRipple: Match = {
  myPhotoId: "photo-old",
  myPhotoUploadedAt: "2026-06-01T10:00:00.000Z",
  timestamp: "2026-06-01T12:00:00.000Z",
};

assert(
  "old ripple resolves old library row",
  findMyPhotoForMatch(oldRipple, library)?.backendId === "photo-old",
);

assert(
  "known missing id does not fall back to newest",
  findMyPhotoForMatch({ ...oldRipple, myPhotoId: "photo-missing" }, library) ===
    undefined,
);

assert(
  "legacy row without id uses upload time not newest",
  findMyPhotoForMatch(
    {
      myPhotoUploadedAt: "2026-06-01T10:00:00.000Z",
      timestamp: "2026-06-01T12:00:00.000Z",
    },
    library,
  )?.backendId === "photo-old",
);

assert(
  "new ripple resolves newest when id present",
  findMyPhotoForMatch(
    {
      myPhotoId: "photo-new",
      myPhotoUploadedAt: "2026-07-05T14:00:00.000Z",
      timestamp: "2026-07-05T14:30:00.000Z",
    },
    library,
  )?.backendId === "photo-new",
);

console.log("Done. exitCode=", process.exitCode ?? 0);
