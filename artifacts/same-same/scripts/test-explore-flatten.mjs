/**
 * Explore flatten dedup — same photoId must produce one tile even when URIs differ.
 * Run: node ./scripts/test-explore-flatten.mjs
 */

function photoKey(uri) {
  if (!uri) return "";
  if (uri.startsWith("data:")) {
    const slice = uri.slice(0, 256);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < slice.length; i++) {
      h ^= slice.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `data-${(h >>> 0).toString(36)}`;
  }
  const noQuery = uri.split("?")[0].replace(/\/+$/, "");
  const apiPhoto = noQuery.match(/\/api\/photos\/([^/]+)\/image$/);
  if (apiPhoto) return `photo-${apiPhoto[1]}`;
  return noQuery;
}

function explorePhotoTileIdentity(p, displayUri) {
  const pid = (p.photoId ?? "").trim();
  if (pid.startsWith("local-my-")) {
    const uriKey = photoKey(displayUri);
    return uriKey ? `viewer:${uriKey}` : `viewer:${pid}`;
  }
  if (pid && !pid.startsWith("local-")) return `photo:${pid}`;
  const uriKey = photoKey(displayUri);
  return uriKey ? `uri:${uriKey}` : "";
}

function flattenCounterpartyTiles(moments, resolveUri) {
  const seen = new Set();
  const tiles = [];
  for (const m of moments) {
    for (const p of m.participants) {
      const displayUri = resolveUri(p);
      const tileId = explorePhotoTileIdentity(p, displayUri);
      if (!tileId || seen.has(tileId)) continue;
      seen.add(tileId);
      tiles.push({ tileId, displayUri });
    }
  }
  return tiles;
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

const photoId = "abc-123";
const moments = [
  {
    id: "e1",
    participants: [
      {
        photoId,
        uri: `data:image/jpeg;base64,/${"A".repeat(500_000)}`,
      },
    ],
  },
  {
    id: "e2",
    participants: [
      {
        photoId,
        uri: `/api/photos/${photoId}/image`,
      },
    ],
  },
  {
    id: "e3",
    participants: [
      {
        photoId,
        uri: `https://api.example.com/api/photos/${photoId}/image`,
      },
    ],
  },
  {
    id: "e4",
    participants: [
      {
        photoId,
        uri: `data:image/jpeg;base64,/${"B".repeat(500_000)}`,
      },
    ],
  },
];

const base = "https://api.example.com";
const resolveUri = (p) => {
  const pid = p.photoId?.trim();
  if (pid && !pid.startsWith("local-")) {
    return `${base}/api/photos/${encodeURIComponent(pid)}/image`;
  }
  return p.uri;
};

const tiles = flattenCounterpartyTiles(moments, resolveUri);
assert(
  tiles.length === 1,
  `same photoId across data+stream URIs should flatten to 1 tile, got ${tiles.length}`,
);

const viewerMoments = [
  {
    id: "local-match-a",
    participants: [
      { photoId: "local-my-a", uri: "file:///same-viewer.jpg" },
      { photoId: "their-1", uri: "file:///their-1.jpg" },
    ],
  },
  {
    id: "local-match-b",
    participants: [
      { photoId: "local-my-b", uri: "file:///same-viewer.jpg" },
      { photoId: "their-2", uri: "file:///their-2.jpg" },
    ],
  },
];

const viewerTiles = flattenCounterpartyTiles(viewerMoments, (p) => p.uri);
const viewerIds = viewerTiles
  .filter((t) => t.tileId.startsWith("viewer:"))
  .map((t) => t.tileId);
assert(
  viewerIds.length === 1,
  `viewer upload across ripples should dedupe to 1 viewer tile, got ${viewerIds.length}`,
);

if (process.exitCode) {
  console.error("Some explore flatten checks failed");
} else {
  console.log("OK — explore flatten dedup tests passed");
}
