import assert from "node:assert/strict";
import { test } from "node:test";

import { testPhotosBuildEnabled } from "../core/testPhotos";

test("test photos build gate reads EXPO_PUBLIC_TEST_PHOTOS", () => {
  // Under node:test the flag is normally unset → production-safe default.
  const enabled = process.env.EXPO_PUBLIC_TEST_PHOTOS === "1";
  assert.equal(testPhotosBuildEnabled(), enabled);
});
