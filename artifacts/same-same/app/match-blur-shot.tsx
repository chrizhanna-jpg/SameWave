import { Redirect } from "expo-router";
import React from "react";

import { testPhotosBuildEnabled } from "@/core/testPhotos";

/** Preview-only shot route — body lives under test-photos (Metro-stubbed in prod). */
export default function MatchBlurShotScreen() {
  if (!testPhotosBuildEnabled()) {
    return <Redirect href="/" />;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../assets/test-photos/shots/MatchBlurShot") as {
    MatchBlurShotInner?: React.ComponentType | null;
  };
  const Inner = mod.MatchBlurShotInner;
  if (!Inner) return <Redirect href="/" />;
  return <Inner />;
}
