import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fallbackTabBarHeight } from "../core/tabBarHeight";
import { layout, space } from "../theme";

describe("fallbackTabBarHeight", () => {
  it("matches TabBar content (paddingTop + item + mark) plus bottom pad", () => {
    const mark = space.sm + 4;
    const content = space.md + layout.iconButtonSize + mark;
    assert.equal(fallbackTabBarHeight(0), content + space.md);
    assert.equal(fallbackTabBarHeight(34), content + 34);
    assert.equal(fallbackTabBarHeight(8), content + space.md);
  });

  it("tabBarContentHeight matches the content portion of the bar (sans mark)", () => {
    assert.equal(layout.tabBarContentHeight, space.md + layout.iconButtonSize);
  });
});
