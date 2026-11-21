import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fallbackTabBarHeight } from "../core/tabBarHeight";
import { layout, space } from "../theme";

describe("fallbackTabBarHeight", () => {
  it("matches TabBar content (paddingTop + item) plus bottom pad", () => {
    const content = space.md + layout.iconButtonSize;
    assert.equal(fallbackTabBarHeight(0), content + space.md);
    assert.equal(fallbackTabBarHeight(34), content + 34);
    assert.equal(fallbackTabBarHeight(8), content + space.md);
  });

  it("tabBarContentHeight matches the content portion of the bar", () => {
    assert.equal(layout.tabBarContentHeight, space.md + layout.iconButtonSize);
  });
});
