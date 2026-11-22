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
  CLUSTER_BADGE_SIZE,
  CLUSTER_SCREEN_PX,
  clusterMarkers,
  expandUnresolvedClusters,
  focusBounds,
  frameTransform,
  geodesicArcPath,
  geodesicLonLat,
  isOverwideLine,
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

test("coincident clusters expand into a tidy tappable group at high zoom", () => {
  const stacked: MapMarker[] = [
    { waveId: "a", side: "mine", photoId: "p1", point: { x: 100, y: 100 } },
    { waveId: "b", side: "mine", photoId: "p2", point: { x: 100, y: 100 } },
    { waveId: "c", side: "mine", photoId: "p3", point: { x: 100.01, y: 100 } },
  ];
  const merged = clusterMarkers(stacked, 9, 44);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.count, 3);
  assert.ok(membersTrueSpan(merged[0]!.members) < 1);
  const expanded = expandUnresolvedClusters(merged, 9, {
    expandAboveScale: 8,
    expandScreenPx: 30,
    clusterScreenPx: 44,
  });
  assert.equal(expanded.length, 3);
  assert.ok(expanded.every((c) => c.count === 1));
  // Distinct display positions, still near the true centroid.
  const keys = new Set(expanded.map((c) => `${c.point.x.toFixed(2)},${c.point.y.toFixed(2)}`));
  assert.equal(keys.size, 3);
  for (const c of expanded) {
    assert.ok(Math.hypot(c.point.x - 100, c.point.y - 100) < 5);
  }
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
      theirs: "FR",
      mineLonLat: [-0.12, 51.5] as [number, number],
      theirsLonLat: [2.35, 48.85] as [number, number],
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
      viewScale: 2,
      clusterScreenPx: CLUSTER_SCREEN_PX,
      mapWidth,
      maxLineWidthFraction: MAX_LINE_WIDTH_FRACTION,
    },
    projectLonLat,
  );
  assert.ok(view.lines.some((l) => l.waveId === "short"));
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
