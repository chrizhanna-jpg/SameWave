/**
 * Ripplefire explore: viewer photo may repeat across many ripples.
 * Run: node ./scripts/test-explore-cap.mjs
 */

function capExplorePhotoRepeats(moments, maxPerPhoto = 1, options) {
  const exemptUserId = options?.exemptUserId?.trim() || null;
  const counts = new Map();
  const out = [];
  for (const moment of moments) {
    const cappedPhotoIds = [];
    for (const p of moment.participants) {
      const id = p.photoId?.trim();
      if (!id) continue;
      if (exemptUserId && p.userId?.trim() === exemptUserId) continue;
      cappedPhotoIds.push(id);
    }
    let blocked = false;
    for (const id of cappedPhotoIds) {
      const next = (counts.get(id) ?? 0) + 1;
      if (next > maxPerPhoto) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    for (const id of cappedPhotoIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    out.push(moment);
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

const viewerId = "viewer-user-1";
const multiRippleMoments = [
  {
    id: "e1",
    participants: [
      { photoId: "my-sky-today", userId: viewerId },
      { photoId: "their-1", userId: "other-1" },
    ],
  },
  {
    id: "e2",
    participants: [
      { photoId: "my-sky-today", userId: viewerId },
      { photoId: "their-2", userId: "other-2" },
    ],
  },
  {
    id: "e3",
    participants: [
      { photoId: "my-sky-today", userId: viewerId },
      { photoId: "their-3", userId: "other-3" },
    ],
  },
];

const cappedAll = capExplorePhotoRepeats(multiRippleMoments);
assert(
  cappedAll.length === 1,
  `without viewer exempt expected 1 moment, got ${cappedAll.length}`,
);

const cappedViewer = capExplorePhotoRepeats(multiRippleMoments, 1, {
  exemptUserId: viewerId,
});
assert(
  cappedViewer.length === 3,
  `with viewer exempt expected 3 moments, got ${cappedViewer.length}`,
);

const viralCounterparty = [
  {
    id: "a",
    participants: [
      { photoId: "u1", userId: "a" },
      { photoId: "viral", userId: "x" },
    ],
  },
  {
    id: "b",
    participants: [
      { photoId: "u2", userId: "b" },
      { photoId: "viral", userId: "x" },
    ],
  },
];
const cappedViral = capExplorePhotoRepeats(viralCounterparty);
assert(
  cappedViral.length === 1,
  `viral counterparty should cap to 1, got ${cappedViral.length}`,
);

if (process.exitCode) {
  console.error("Some explore cap checks failed");
} else {
  console.log("OK — explore cap tests passed");
}
