import { Redirect } from "expo-router";
import React from "react";

import { testPhotosBuildEnabled } from "@/core/testPhotos";

/**
 * Hidden location authenticity diagnostic.
 * Available in __DEV__ or Expo preview (TEST_PHOTOS=1). Production redirects;
 * Metro stubs the screen module like sample photos.
 */
export default function LocationDiagScreen() {
  const allowed = __DEV__ || testPhotosBuildEnabled();
  if (!allowed) {
    return <Redirect href="/" />;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../assets/test-photos/LocationDiagScreen") as {
    LocationDiagScreenInner?: React.ComponentType | null;
  };
  const Inner = mod.LocationDiagScreenInner;
  if (!Inner) {
    return <Redirect href="/" />;
  }
  return <Inner />;
}
