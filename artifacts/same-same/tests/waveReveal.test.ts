import assert from "node:assert/strict";
import { test } from "node:test";

import type { Wave } from "../core/types";
import {
  shouldRevealWave,
  unrevealedWaves,
  withRevealedWaveId,
} from "../core/waves";

const wave = (id: string, formedAt: string | null): Wave => ({
  id,
  formedAt,
  mine: { photoId: `${id}-m`, uri: null, countryCode: "GB", takenAt: formedAt },
  theirs: { photoId: `${id}-t`, uri: null, countryCode: "FR", takenAt: formedAt },
});

const BASELINE = "2026-11-01T00:00:00Z";

test("shouldRevealWave is true only when the id is not in revealedIds", () => {
  assert.equal(shouldRevealWave("a", []), true);
  assert.equal(shouldRevealWave("a", ["a"]), false);
  assert.equal(shouldRevealWave("a", ["b"]), true);
  assert.equal(shouldRevealWave("", []), false);
});

test("withRevealedWaveId appends once and is idempotent", () => {
  assert.deepEqual(withRevealedWaveId([], "a"), ["a"]);
  assert.deepEqual(withRevealedWaveId(["a"], "a"), ["a"]);
  assert.deepEqual(withRevealedWaveId(["a"], "b"), ["a", "b"]);
  assert.deepEqual(withRevealedWaveId(["a"], ""), ["a"]);
});

test("unrevealedWaves returns oldest first and skips already revealed", () => {
  const waves = [
    wave("later", "2026-11-05T00:00:00Z"),
    wave("sooner", "2026-11-02T00:00:00Z"),
    wave("done", "2026-11-03T00:00:00Z"),
  ];
  assert.deepEqual(
    unrevealedWaves(waves, ["done"], BASELINE).map((w) => w.id),
    ["sooner", "later"],
  );
});

test("unrevealedWaves skips pre-baseline Waves (same as unseen)", () => {
  const waves = [wave("old", "2026-10-01T00:00:00Z"), wave("new", "2026-11-02T00:00:00Z")];
  assert.deepEqual(unrevealedWaves(waves, [], BASELINE).map((w) => w.id), ["new"]);
});

test("once revealed, push-tap and auto-reveal both skip the same Wave", () => {
  // Shared store: first path marks revealed; second path must not re-queue.
  let revealed: string[] = [];
  const id = "wave-1";
  assert.equal(shouldRevealWave(id, revealed), true);
  revealed = withRevealedWaveId(revealed, id); // auto-reveal claims it
  assert.equal(shouldRevealWave(id, revealed), false); // push-tap must not replay
  revealed = withRevealedWaveId(revealed, id); // idempotent
  assert.deepEqual(revealed, ["wave-1"]);
  assert.equal(
    unrevealedWaves([wave(id, "2026-11-02T00:00:00Z")], revealed, BASELINE).length,
    0,
  );
});
