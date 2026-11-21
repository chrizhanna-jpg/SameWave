import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arcBow,
  boundsOf,
  buildMapGeometry,
  buildMapLines,
  buildMapMarkers,
  focusBounds,
  frameTransform,
  geodesicArcPath,
  geodesicLonLat,
  lineAt,
  markerAt,
  MIN_LINE_LENGTH,
  pathFromPoints,
  spreadCoincidentMarkers,
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

test("several Waves between the same two countries fan out", () => {
  const lines = buildMapLines(
    [
      { id: "a", mine: "GB", theirs: "FR" },
      { id: "b", mine: "FR", theirs: "GB" },
      { id: "c", mine: "GB", theirs: "FR" },
    ],
    project,
    options,
  );
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

test("coincident mine markers fan out so each stays tappable", () => {
  const stacked: MapMarker[] = [
    { waveId: "a", side: "mine", photoId: "p1", point: { x: 100, y: 100 } },
    { waveId: "b", side: "mine", photoId: "p1", point: { x: 100, y: 100 } },
    { waveId: "c", side: "mine", photoId: "p1", point: { x: 100, y: 100 } },
  ];
  const spread = spreadCoincidentMarkers(stacked, 12);
  assert.equal(spread.length, 3);
  const keys = new Set(spread.map((m) => `${m.point.x.toFixed(1)},${m.point.y.toFixed(1)}`));
  assert.equal(keys.size, 3);
  for (const marker of spread) {
    assert.equal(markerAt(spread, marker.point, 6)?.waveId, marker.waveId);
  }
});

test("spreadCoincidentMarkers clusters near-coincident Europe pins", () => {
  const clustered = spreadCoincidentMarkers(
    [
      { waveId: "a", side: "mine", photoId: "pa", point: { x: 100, y: 100 } },
      { waveId: "b", side: "mine", photoId: "pb", point: { x: 105, y: 102 } },
      { waveId: "c", side: "mine", photoId: "pc", point: { x: 108, y: 99 } },
    ],
    10,
    8,
  );
  const keys = new Set(clustered.map((m) => `${m.point.x.toFixed(1)},${m.point.y.toFixed(1)}`));
  assert.equal(keys.size, 3);
  assert.ok(
    Math.hypot(
      clustered[1]!.point.x - clustered[0]!.point.x,
      clustered[1]!.point.y - clustered[0]!.point.y,
    ) >= 5,
  );
});

test("buildMapMarkers spreads shared London sample endpoints", () => {
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
  assert.notEqual(
    `${markers[0]!.point.x},${markers[0]!.point.y}`,
    `${markers[1]!.point.x},${markers[1]!.point.y}`,
  );
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
