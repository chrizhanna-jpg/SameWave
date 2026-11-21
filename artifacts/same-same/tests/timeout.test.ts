import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withTimeout } from "../lib/timeout";

describe("withTimeout", () => {
  it("resolves when the promise wins", async () => {
    const value = await withTimeout(Promise.resolve(7), 50);
    assert.equal(value, 7);
  });

  it("rejects when time runs out", async () => {
    await assert.rejects(
      () => withTimeout(new Promise(() => undefined), 20, "too slow"),
      /too slow/,
    );
  });
});
