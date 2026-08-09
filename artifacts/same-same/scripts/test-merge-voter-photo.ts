/**
 * Journey merge must not overwrite per-ripple voter photo ids.
 * Run: pnpm exec tsx scripts/test-merge-voter-photo.ts
 */

type Match = {
  id: string;
  myPhotoId?: string;
  myPhotoUploadedAt?: string;
  theirPhotoId?: string;
  theirPhoto: string;
  timestamp: string;
};

/** Mirrors mergeMatchesById mergeRow — local voter ids win over journey. */
function mergeRow(existing: Match, incoming: Match): Match {
  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    myPhotoId: existing.myPhotoId || incoming.myPhotoId,
    myPhotoUploadedAt: existing.myPhotoUploadedAt || incoming.myPhotoUploadedAt,
  };
}

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const localWithId: Match = {
  id: "local-1",
  theirPhotoId: "their-photo-1",
  theirPhoto: "https://images.unsplash.com/photo-1?w=400",
  timestamp: "2026-06-01T12:00:00.000Z",
  myPhotoId: "photo-old",
  myPhotoUploadedAt: "2026-06-01T10:00:00.000Z",
};

const journeyWrongId: Match = {
  id: "journey-row",
  theirPhotoId: "their-photo-1",
  theirPhoto: "https://images.unsplash.com/photo-1?w=400",
  timestamp: "2026-06-01T12:00:00.000Z",
  myPhotoId: "photo-new",
  myPhotoUploadedAt: "2026-07-05T14:00:00.000Z",
};

const merged = mergeRow(localWithId, journeyWrongId);

assert(
  "merge keeps local myPhotoId when journey sends newest",
  merged.myPhotoId === "photo-old",
  merged.myPhotoId,
);

assert(
  "merge keeps local myPhotoUploadedAt",
  merged.myPhotoUploadedAt === "2026-06-01T10:00:00.000Z",
  merged.myPhotoUploadedAt,
);

const backfilled = mergeRow(
  {
    id: "local-2",
    theirPhotoId: "their-photo-2",
    theirPhoto: "https://images.unsplash.com/photo-2?w=400",
    timestamp: "2026-06-02T12:00:00.000Z",
  },
  {
    id: "journey-2",
    theirPhotoId: "their-photo-2",
    theirPhoto: "https://images.unsplash.com/photo-2?w=400",
    timestamp: "2026-06-02T12:00:00.000Z",
    myPhotoId: "photo-from-journey",
  },
);

assert(
  "merge still backfills myPhotoId when local row had none",
  backfilled.myPhotoId === "photo-from-journey",
  backfilled.myPhotoId,
);

console.log("Done. exitCode=", process.exitCode ?? 0);
