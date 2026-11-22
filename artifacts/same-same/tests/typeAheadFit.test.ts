import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TYPEAHEAD_MAX_ROWS,
  TYPEAHEAD_MIN_ROWS,
  TYPEAHEAD_ROW_HEIGHT,
  typeAheadListHeight,
  typeAheadRowsThatFit,
} from "../core/typeAheadFit";

test("type-ahead row budget never exceeds the preferred cap", () => {
  assert.equal(typeAheadRowsThatFit(2000, TYPEAHEAD_MAX_ROWS), TYPEAHEAD_MAX_ROWS);
});

test("type-ahead row budget shrinks when the keyboard leaves little room", () => {
  const forFour = TYPEAHEAD_ROW_HEIGHT * 4 + 16;
  assert.equal(typeAheadRowsThatFit(forFour, TYPEAHEAD_MAX_ROWS), 4);
  const tiny = TYPEAHEAD_ROW_HEIGHT * 2;
  assert.equal(typeAheadRowsThatFit(tiny, TYPEAHEAD_MAX_ROWS), TYPEAHEAD_MIN_ROWS);
});

test("type-ahead list height matches row math", () => {
  assert.equal(typeAheadListHeight(0), 0);
  assert.ok(typeAheadListHeight(6) > typeAheadListHeight(4));
});
