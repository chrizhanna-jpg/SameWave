import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arcBow,
  attachLinesToClusters,
  boundsOf,
  buildClusteredView,
  buildMapGeometry,
  buildMapLines,
  buildMapMarkers,
  CITY_MERGE_KM,
  CLUSTER_BADGE_SIZE,
  CLUSTER_SCREEN_PX,
  clusterMarkers,
  expandUnresolvedClusters,
  focalZoomTransform,
  focusBounds,
  frameTransform,
  incrementalPinchStep,
  geodesicArcPath,
  geodesicLonLat,
  haversineKm,
  isOverwideLine,
  isStickyStack,
  lineAt,
  lineWidthSpan,
  markerAt,
  MAX_LINE_WIDTH_FRACTION,
  membersTrueSpan,
  MIN_LINE_LENGTH,
  pathFromPoints,
  STRAIGHT_BELOW,
  type MapMarker,
  type Point,
} from "../core/mapGeometry";
import { COUNTRY_CENTROID_LON_LAT } from "../data/countryCentroids";

const project = (code: string): Point | null => {
  const lonLat = COUNTRY_CENTROID_LON_LAT[code];
  return lonLat ? { x: (lonLat[0] + 180) * 2, y: (90 - lonLat[1]) * 2 } : null;
};
const options = { loopSize: 26, fallbackCountry: "GB" };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

test("two countries make an arc; same country with one pin draws no loop", () => {
  const lines = buildMapLines(
    [
      { id: "abroad", mine: "GB", theirs: "JP" },
      { id: "home", mine: "GB", theirs: "GB" },
    ],
    project,
    options,
  );
  assert.deepEqual(
    lines.map((l) => [l.waveId, l.kind]),
    [["abroad", "arc"]],
  );
  assert.match(lines[0]?.d ?? "", /^M[\d.-]+ [\d.-]+ L/);
});

test("identical endpoints keep pins only — never a self-loop", () => {
  const { lines, markers } = buildMapGeometry(
    [{ id: "same", mine: "GB", theirs: "GB" }],
    project,
    options,
  );
  assert.equal(lines.length, 0);
  assert.ok(markers.length >= 2);
  assert.ok(markers.every((m) => m.waveId === "same"));
});

test("short distinct GPS pairs draw a straight stroke, not a curl", () => {
  // Scale like a fitted Equal Earth canvas so ~0.5° is a few dozen map units.
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 40,
    y: (90 - lonLat[1]) * 40,
  });
  const { lines } = buildMapGeometry(
    [
      {
        id: "short",
        mine: "GB",
        theirs: "GB",
        mineLonLat: [-0.2, 51.5],
        theirsLonLat: [0.3, 51.6],
      },
    ],
    project,
    { ...options, straightBelow: 80, minLineLength: 3 },
    projectLonLat,
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.kind, "straight");
  assert.match(lines[0]?.d ?? "", /^M[\d.-]+ [\d.-]+ L[\d.-]+ [\d.-]+$/);
});

test("near-zero pairs drop their stroke", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 2,
    y: (90 - lonLat[1]) * 2,
  });
  const { lines, markers } = buildMapGeometry(
    [
      {
        id: "hair",
        mine: "GB",
        theirs: "GB",
        mineLonLat: [-0.12, 51.5],
        theirsLonLat: [-0.12 + 0.0001, 51.5],
      },
    ],
    project,
    options,
    projectLonLat,
  );
  assert.equal(lines.length, 0);
  assert.ok(markers.length >= 2);
});

test("arc bow is capped and shrinks for short chords", () => {
  assert.ok(Math.abs(arcBow(0, 200)) <= 0.14);
  assert.ok(Math.abs(arcBow(0, 20)) < Math.abs(arcBow(0, 200)));
  assert.ok(arcBow(0, 100) > 0 && arcBow(1, 100) < 0);
});

test("several Waves between the same two countries get distinct bows", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 40,
    y: (90 - lonLat[1]) * 40,
  });
  const lines = buildMapLines(
    [
      {
        id: "a",
        mine: "GB",
        theirs: "FR",
        mineLonLat: [-0.12, 51.5],
        theirsLonLat: [2.35, 48.85],
      },
      {
        id: "b",
        mine: "FR",
        theirs: "GB",
        mineLonLat: [2.35, 48.85],
        theirsLonLat: [-0.12, 51.5],
      },
      {
        id: "c",
        mine: "GB",
        theirs: "FR",
        mineLonLat: [-0.12, 51.5],
        theirsLonLat: [2.35, 48.85],
      },
    ],
    project,
    options,
    projectLonLat,
  );
  assert.equal(lines.length, 3);
  assert.equal(new Set(lines.map((l) => l.d)).size, 3);
});

test("every drawn line ends on both mine and theirs pins", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 2,
    y: (90 - lonLat[1]) * 2,
  });
  const waves = [
    {
      id: "w1",
      mine: { photoId: "m", countryCode: "GB", lat: 51.5, lng: -0.12 },
      theirs: { photoId: "t1", countryCode: "BR", lat: -23.55, lng: -46.63 },
    },
    {
      id: "w2",
      mine: { photoId: "m", countryCode: "GB", lat: 51.5, lng: -0.12 },
      theirs: { photoId: "t2", countryCode: "FR", lat: 48.85, lng: 2.35 },
    },
  ];
  const markers = buildMapMarkers(waves, project, options, projectLonLat);
  const { lines } = buildMapGeometry(
    waves.map((w) => ({
      id: w.id,
      mine: w.mine.countryCode,
      theirs: w.theirs.countryCode,
      mineLonLat: [w.mine.lng, w.mine.lat] as [number, number],
      theirsLonLat: [w.theirs.lng, w.theirs.lat] as [number, number],
    })),
    project,
    options,
    projectLonLat,
  );
  assert.ok(lines.length >= 1);
  for (const line of lines) {
    const mine = markers.find((m) => m.waveId === line.waveId && m.side === "mine");
    const theirs = markers.find((m) => m.waveId === line.waveId && m.side === "theirs");
    assert.ok(mine && theirs, "both pins exist");
    const start = line.points[0]!;
    const end = line.points[line.points.length - 1]!;
    assert.ok(distance(start, mine!.point) < 0.5, "line starts on mine pin");
    assert.ok(distance(end, theirs!.point) < 0.5, "line ends on theirs pin");
  }
});

test("a Wave with an unknown country still gets pins (no loop scribble)", () => {
  const { lines, markers } = buildMapGeometry(
    [
      { id: "half", mine: "GB", theirs: null },
      { id: "none", mine: null, theirs: null },
    ],
    project,
    options,
  );
  assert.equal(lines.length, 0);
  assert.ok(markers.length >= 2);
});

test("touching a line tip opens that Wave", () => {
  const lines = buildMapLines(
    [
      { id: "first", mine: "GB", theirs: "FR" },
      { id: "second", mine: "GB", theirs: "DE" },
    ],
    project,
    options,
  );
  for (const line of lines) {
    assert.equal(lineAt(lines, line.tip, 22)?.waveId, line.waveId);
  }
});

test("a touch on open water opens nothing", () => {
  const lines = buildMapLines([{ id: "abroad", mine: "GB", theirs: "JP" }], project, options);
  assert.equal(lineAt(lines, { x: 5, y: 350 }, 22), null);
  assert.equal(lineAt(lines, lines[0]!.tip, 22)?.waveId, "abroad");
});

test("precise lon/lat endpoints draw an arc and expose both markers", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 2,
    y: (90 - lonLat[1]) * 2,
  });
  const { lines, markers } = buildMapGeometry(
    [
      {
        id: "gps",
        mine: "GB",
        theirs: "JP",
        mineLonLat: [-0.12, 51.5],
        theirsLonLat: [139.7, 35.7],
      },
    ],
    project,
    { ...options, minLineLength: 4 },
    projectLonLat,
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.kind, "arc");
  assert.ok(markers.find((m) => m.side === "mine"));
  assert.ok(markers.find((m) => m.side === "theirs"));
});

test("overlapping pins merge into one cluster with a count at the true spot", () => {
  const stacked: MapMarker[] = [
    { waveId: "a", side: "mine", photoId: "p1", point: { x: 100, y: 100 } },
    { waveId: "b", side: "mine", photoId: "p2", point: { x: 100, y: 100 } },
    { waveId: "c", side: "mine", photoId: "p3", point: { x: 101, y: 100 } },
  ];
  const clusters = clusterMarkers(stacked, 1, 44);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]!.count, 3);
  assert.ok(Math.abs(clusters[0]!.point.x - 100.333) < 0.1);
  assert.equal(clusters[0]!.point.y, 100);
});

test("cluster radius is screen pixels divided by viewScale (not raw map units)", () => {
  const nearby: MapMarker[] = [
    { waveId: "a", side: "mine", photoId: "pa", point: { x: 100, y: 100 } },
    { waveId: "b", side: "theirs", photoId: "pb", point: { x: 130, y: 100 } },
  ];
  // 30 map units × scale 1 = 30 screen px < 44 → merge.
  assert.equal(clusterMarkers(nearby, 1, 44).length, 1);
  // Same 30 map units × scale 2 = 60 screen px > 44 → split.
  const split = clusterMarkers(nearby, 2, 44);
  assert.equal(split.length, 2);
  assert.ok(split.every((c) => c.count === 1));
  assert.deepEqual(split[0]!.point, { x: 100, y: 100 });
  assert.deepEqual(split[1]!.point, { x: 130, y: 100 });
});

test("city-level pins stay one stacked badge at every zoom — never a ring", () => {
  const londonA: [number, number] = [-0.1278, 51.5074];
  const londonB: [number, number] = [-0.12, 51.515]; // ~1 km away
  const paris: [number, number] = [2.3522, 48.8566];
  assert.ok(haversineKm(londonA, londonB) < CITY_MERGE_KM);
  assert.ok(haversineKm(londonA, paris) > CITY_MERGE_KM);

  const stacked: MapMarker[] = [
    { waveId: "a", side: "mine", photoId: "p1", point: { x: 100, y: 100 }, lonLat: londonA },
    { waveId: "b", side: "mine", photoId: "p2", point: { x: 100.2, y: 100.1 }, lonLat: londonB },
    { waveId: "c", side: "mine", photoId: "p3", point: { x: 100.05, y: 100 }, lonLat: londonA },
    {
      waveId: "d",
      side: "theirs",
      photoId: "p4",
      // Far in map units so screen clustering alone would split at high zoom.
      point: { x: 400, y: 280 },
      lonLat: paris,
    },
  ];
  for (const scale of [1, 4, 9, 12]) {
    const clusters = clusterMarkers(stacked, scale, 44, CITY_MERGE_KM);
    const london = clusters.filter((c) =>
      c.members.some((m) => m.lonLat && haversineKm(m.lonLat, londonA) < CITY_MERGE_KM),
    );
    assert.equal(london.length, 1, `London must stay one pin at scale ${scale}`);
    assert.equal(london[0]!.count, 3);
    assert.ok(isStickyStack(london[0]!, CITY_MERGE_KM));
    // No artificial offsets — display point is the true centroid.
    const cx = london[0]!.members.reduce((s, m) => s + m.point.x, 0) / 3;
    const cy = london[0]!.members.reduce((s, m) => s + m.point.y, 0) / 3;
    assert.ok(Math.abs(london[0]!.point.x - cx) < 1e-9);
    assert.ok(Math.abs(london[0]!.point.y - cy) < 1e-9);
  }
  // Ring expand is a no-op.
  const high = clusterMarkers(stacked, 12, 44, CITY_MERGE_KM);
  const after = expandUnresolvedClusters(high, 12);
  assert.equal(after.length, high.length);
  assert.ok(after.some((c) => c.count === 3));
});

test("focal zoom keeps the map point under the fingers fixed (top-left origin)", () => {
  const oldScale = 2;
  const newScale = 4;
  const translateX = -40;
  const translateY = -80;
  const focalX = 120;
  const focalY = 200;
  const next = focalZoomTransform(oldScale, newScale, translateX, translateY, focalX, focalY);
  assert.equal(next.scale, 4);
  // Map coords under the focal before zoom…
  const mapX = (focalX - translateX) / oldScale;
  const mapY = (focalY - translateY) / oldScale;
  // …must land under the same screen focal after zoom.
  assert.ok(Math.abs(mapX * next.scale + next.x - focalX) < 1e-9);
  assert.ok(Math.abs(mapY * next.scale + next.y - focalY) < 1e-9);
  // Matches the stated formula.
  assert.equal(next.x, focalX - (focalX - translateX) * (newScale / oldScale));
  assert.equal(next.y, focalY - (focalY - translateY) * (newScale / oldScale));
});

test("incremental pinch ignores finger-lift focal jump (no translation jump)", () => {
  // Steady two-finger zoom about a mid-gap focal.
  let live = { scale: 2, x: -40, y: -80 };
  let prev = { pinchScale: 1, focalX: 180, focalY: 320 };
  const steady = incrementalPinchStep(live, prev, {
    pinchScale: 1.4,
    focalX: 182,
    focalY: 318,
    numberOfPointers: 2,
  });
  assert.equal(steady.applied, true);
  live = steady.live;
  prev = steady.prev;

  const beforeLift = { ...live };
  // Absolute-from-baseline maths would shove the map by ~(1-ratio)×half the
  // finger gap when Android moves the focal onto the remaining finger.
  const fingerGapY = 160;
  const liftedFocalY = prev.focalY - fingerGapY / 2;
  const absoluteJump = focalZoomTransform(
    2,
    live.scale,
    -40,
    -80,
    prev.focalX,
    liftedFocalY,
  );
  assert.ok(
    Math.abs(absoluteJump.y - beforeLift.y) > 20,
    "absolute baseline would jump on finger lift",
  );

  // Incremental path: skip numberOfPointers < 2 → no translation change.
  const lift = incrementalPinchStep(live, prev, {
    pinchScale: prev.pinchScale,
    focalX: prev.focalX,
    focalY: liftedFocalY,
    numberOfPointers: 1,
  });
  assert.equal(lift.applied, false);
  assert.equal(lift.live.x, beforeLift.x);
  assert.equal(lift.live.y, beforeLift.y);
  assert.equal(lift.live.scale, beforeLift.scale);
  assert.deepEqual(lift.prev, prev);
});

test("no drawn segment spans most of the map width", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 4,
    y: (90 - lonLat[1]) * 4,
  });
  // Rough Equal-Earth-ish width for this projection (~1440).
  const mapWidth = 360 * 4;
  const waves = [
    {
      id: "short",
      mine: "GB",
      theirs: "DE",
      mineLonLat: [-0.12, 51.5] as [number, number],
      theirsLonLat: [13.4, 52.52] as [number, number],
    },
    {
      id: "ocean",
      mine: "US",
      theirs: "JP",
      mineLonLat: [-74, 40.7] as [number, number],
      theirsLonLat: [139.7, 35.7] as [number, number],
    },
  ];
  const view = buildClusteredView(
    waves,
    project,
    {
      ...options,
      // High enough that GB/DE stay separate pins, ocean chord still over-wide.
      viewScale: 5,
      clusterScreenPx: CLUSTER_SCREEN_PX,
      mapWidth,
      maxLineWidthFraction: MAX_LINE_WIDTH_FRACTION,
      expandAboveScale: 99,
    },
    projectLonLat,
  );
  assert.ok(view.lines.some((l) => l.waveId === "short"), "regional chord kept");
  assert.ok(!view.lines.some((l) => l.waveId === "ocean"), "US→JP ocean stroke dropped");
  for (const line of view.lines) {
    assert.ok(
      !isOverwideLine(line, mapWidth, MAX_LINE_WIDTH_FRACTION),
      `line ${line.waveId} span ${lineWidthSpan(line)} vs map ${mapWidth}`,
    );
  }
  assert.ok(CLUSTER_BADGE_SIZE >= 22 && CLUSTER_BADGE_SIZE <= 24);
});

test("lines attach to cluster pins and drop when both ends share a cluster", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 40,
    y: (90 - lonLat[1]) * 40,
  });
  const waves = [
    {
      id: "a",
      mine: "GB",
      theirs: "FR",
      mineLonLat: [-0.12, 51.5] as [number, number],
      theirsLonLat: [2.35, 48.85] as [number, number],
    },
    {
      id: "b",
      mine: "GB",
      theirs: "DE",
      mineLonLat: [-0.12, 51.5] as [number, number],
      theirsLonLat: [13.4, 52.52] as [number, number],
    },
  ];
  const zoomedOut = buildClusteredView(
    waves,
    project,
    { ...options, viewScale: 1, clusterScreenPx: CLUSTER_SCREEN_PX },
    projectLonLat,
  );
  assert.ok(zoomedOut.clusters.some((c) => c.count >= 2), "London mines should merge");
  for (const line of zoomedOut.lines) {
    const start = line.points[0]!;
    const end = line.points[line.points.length - 1]!;
    const hitStart = zoomedOut.clusters.some(
      (c) => Math.hypot(c.point.x - start.x, c.point.y - start.y) < 0.5,
    );
    const hitEnd = zoomedOut.clusters.some(
      (c) => Math.hypot(c.point.x - end.x, c.point.y - end.y) < 0.5,
    );
    assert.ok(hitStart && hitEnd, "line ends on cluster pins");
  }

  // Same-city pair with no geographic chord stays lineless inside one cluster.
  const same = buildMapGeometry(
    [{ id: "home", mine: "GB", theirs: "GB" }],
    project,
    options,
  );
  const clusters = clusterMarkers(same.markers, 1, 44);
  assert.equal(attachLinesToClusters(same.lines, same.markers, clusters).length, 0);
});

test("buildMapMarkers keeps shared London endpoints at the true spot", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 2,
    y: (90 - lonLat[1]) * 2,
  });
  const waves = [
    {
      id: "w1",
      mine: { photoId: "m", countryCode: "GB", lat: 51.5, lng: -0.12 },
      theirs: { photoId: "t1", countryCode: "FR", lat: 48.85, lng: 2.35 },
    },
    {
      id: "w2",
      mine: { photoId: "m", countryCode: "GB", lat: 51.5, lng: -0.12 },
      theirs: { photoId: "t2", countryCode: "DE", lat: 52.52, lng: 13.4 },
    },
  ];
  const markers = buildMapMarkers(waves, project, options, projectLonLat).filter(
    (m) => m.side === "mine",
  );
  assert.equal(markers.length, 2);
  // True positions — no spiderfy offset.
  assert.equal(
    `${markers[0]!.point.x},${markers[0]!.point.y}`,
    `${markers[1]!.point.x},${markers[1]!.point.y}`,
  );
  const clustered = clusterMarkers(markers, 1, 44);
  assert.equal(clustered.length, 1);
  assert.equal(clustered[0]!.count, 2);
});

test("pathFromPoints rejects chords shorter than MIN_LINE_LENGTH", () => {
  assert.equal(
    pathFromPoints(
      [
        { x: 0, y: 0 },
        { x: MIN_LINE_LENGTH - 1, y: 0 },
      ],
      0,
    ),
    null,
  );
  assert.ok(
    pathFromPoints(
      [
        { x: 0, y: 0 },
        { x: MIN_LINE_LENGTH + 5, y: 0 },
      ],
      0,
    ),
  );
});

test("geodesicLonLat midpoints sit between the endpoints", () => {
  const mid = geodesicLonLat([-0.12, 51.5], [2.35, 48.85], 0.5);
  assert.ok(mid[0] > -0.12 && mid[0] < 2.35);
  assert.ok(mid[1] < 51.5 && mid[1] > 48.85);
});

test("geodesicArcPath returns a polyline arc with a tip", () => {
  const projectLonLat = (lonLat: [number, number]): Point => ({
    x: (lonLat[0] + 180) * 2,
    y: (90 - lonLat[1]) * 2,
  });
  const shape = geodesicArcPath([-0.12, 51.5], [139.7, 35.7], projectLonLat, 0.1, 4);
  assert.ok(shape);
  assert.match(shape!.d, /^M/);
  assert.ok(shape!.points.length > 4);
});

test("frameTransform zooms a Europe-sized bounds into a phone box", () => {
  const box = { width: 390, height: 700 };
  const bounds = { minX: 200, minY: 80, maxX: 280, maxY: 160 };
  const framed = frameTransform(bounds, box, { padding: 40, minScale: 1, maxScale: 5 });
  assert.ok(framed.scale > 1.5);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  assert.ok(Math.abs(cx * framed.scale + framed.x - box.width / 2) < 1);
  assert.ok(Math.abs(cy * framed.scale + framed.y - box.height / 2) < 1);
  assert.ok(STRAIGHT_BELOW > MIN_LINE_LENGTH);
});

test("boundsOf returns null for an empty list", () => {
  assert.equal(boundsOf([]), null);
  assert.deepEqual(boundsOf([{ x: 1, y: 2 }, { x: 4, y: 0 }]), {
    minX: 1,
    minY: 0,
    maxX: 4,
    maxY: 2,
  });
});

test("focusBounds keeps a Europe cluster when one pin is overseas", () => {
  const europe = [
    { x: 100, y: 100 },
    { x: 110, y: 105 },
    { x: 95, y: 98 },
    { x: 120, y: 112 },
    { x: 108, y: 90 },
  ];
  const withBrazil = [...europe, { x: 400, y: 350 }];
  const focused = focusBounds(withBrazil, { x: 100, y: 100 });
  assert.ok(focused);
  assert.ok(focused!.maxX < 200);
  assert.ok(focused!.maxY < 200);
});
