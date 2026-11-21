import assert from "node:assert/strict";
import { test } from "node:test";

import { arcBow, buildMapLines, lineAt, type Point } from "../core/mapGeometry";
import { COUNTRY_CENTROID_LON_LAT } from "../data/countryCentroids";

const project = (code: string): Point | null => {
  const lonLat = COUNTRY_CENTROID_LON_LAT[code];
  return lonLat ? { x: (lonLat[0] + 180) * 2, y: (90 - lonLat[1]) * 2 } : null;
};
const options = { loopSize: 26, fallbackCountry: "GB" };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

test("two countries make a line and one country makes a loop", () => {
  const lines = buildMapLines(
    [
      { id: "abroad", mine: "GB", theirs: "JP" },
      { id: "home", mine: "GB", theirs: "GB" },
    ],
    project,
    options,
  );
  assert.deepEqual(lines.map((l) => [l.waveId, l.kind]), [
    ["abroad", "arc"],
    ["home", "loop"],
  ]);
  assert.match(lines[0]?.d ?? "", /^M[\d.-]+ [\d.-]+Q/);
  assert.match(lines[1]?.d ?? "", /^M[\d.-]+ [\d.-]+C/);
});

test("a loop starts and ends on its country", () => {
  const [loop] = buildMapLines([{ id: "home", mine: "GB", theirs: "GB" }], project, options);
  const gb = project("GB") as Point;
  const numbers = (loop?.d.match(/-?[\d.]+/g) ?? []).map(Number);
  assert.equal(numbers[0], gb.x);
  assert.equal(numbers[1], gb.y);
  assert.equal(numbers.at(-2), gb.x);
  assert.equal(numbers.at(-1), gb.y);
});

test("several Waves in one country stay far enough apart to tap", () => {
  const waves = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, mine: "GB", theirs: "GB" }));
  const lines = buildMapLines(waves, project, options);
  assert.equal(lines.length, 8);
  assert.equal(new Set(lines.map((l) => l.d)).size, 8);
  const gb = project("GB") as Point;
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i]!;
    assert.ok(distance(a.tip, gb) >= 0.8 * options.loopSize, "loop reaches out of the country");
    for (let j = i + 1; j < lines.length; j++) {
      const gap = distance(a.tip, lines[j]!.tip);
      assert.ok(gap >= 14, `loops ${i} and ${j} are ${gap.toFixed(1)} apart`);
    }
  }
});

test("loops in different countries do not affect each other", () => {
  const lines = buildMapLines(
    [
      { id: "gb1", mine: "GB", theirs: "GB" },
      { id: "jp1", mine: "JP", theirs: "JP" },
    ],
    project,
    options,
  );
  const gb = project("GB") as Point;
  const jp = project("JP") as Point;
  // Both are the first loop of their country, so both point the same way.
  assert.ok(Math.abs((lines[0]!.tip.x - gb.x) - (lines[1]!.tip.x - jp.x)) < 0.2);
  assert.ok(Math.abs((lines[0]!.tip.y - gb.y) - (lines[1]!.tip.y - jp.y)) < 0.2);
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
  assert.ok(arcBow(0) > 0 && arcBow(1) < 0 && arcBow(2) > arcBow(0));
  // The first line bows towards the top of the map.
  const gb = project("GB") as Point;
  const fr = project("FR") as Point;
  assert.ok(lines[0]!.tip.y < (gb.y + fr.y) / 2);
});

test("a Wave with an unknown country is still drawn so it can be reopened", () => {
  const lines = buildMapLines(
    [
      { id: "half", mine: "GB", theirs: null },
      { id: "none", mine: null, theirs: null },
      { id: "unlisted", mine: "AQ", theirs: "GB" },
    ],
    project,
    options,
  );
  assert.deepEqual(lines.map((l) => [l.waveId, l.kind]), [
    ["half", "loop"],
    ["none", "loop"],
    ["unlisted", "loop"],
  ]);
});

test("with no country anywhere the Wave sits in open water", () => {
  const lines = buildMapLines([{ id: "none", mine: null, theirs: null }], project, {
    loopSize: 26,
    fallbackCountry: null,
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.kind, "loop");
});

test("touching the far end of each loop opens that Wave, even with many in one country", () => {
  const waves = Array.from({ length: 8 }, (_, i) => ({ id: `w${i}`, mine: "GB", theirs: "GB" }));
  const lines = buildMapLines(waves, project, options);
  for (const line of lines) {
    assert.equal(lineAt(lines, line.tip, 22)?.waveId, line.waveId);
    // A finger is not exact: a little off the tip still finds it.
    for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5]] as const) {
      const nudged = { x: line.tip.x + dx, y: line.tip.y + dy };
      assert.equal(lineAt(lines, nudged, 22)?.waveId, line.waveId);
    }
  }
});

test("a touch on open water opens nothing", () => {
  const lines = buildMapLines([{ id: "abroad", mine: "GB", theirs: "JP" }], project, options);
  assert.equal(lineAt(lines, { x: 5, y: 350 }, 22), null);
  assert.equal(lineAt(lines, lines[0]!.tip, 22)?.waveId, "abroad");
});

test("two lines between the same countries are told apart", () => {
  const lines = buildMapLines(
    [
      { id: "first", mine: "GB", theirs: "FR" },
      { id: "second", mine: "GB", theirs: "FR" },
    ],
    project,
    options,
  );
  assert.equal(lineAt(lines, lines[0]!.tip, 22)?.waveId, "first");
  assert.equal(lineAt(lines, lines[1]!.tip, 22)?.waveId, "second");
});
