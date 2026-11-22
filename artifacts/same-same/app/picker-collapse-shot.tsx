import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

import { testPhotosBuildEnabled } from "@/core/testPhotos";

const MODES = new Set([
  "feeling-collapsed",
  "feeling-open",
  "topic-waiting",
  "topic-collapsed",
  "topic-open",
  "today-waiting",
]);

/** Preview-only picker collapse / sequencing shots. */
export default function PickerCollapseShotScreen() {
  if (!testPhotosBuildEnabled()) return <Redirect href="/" />;
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = typeof params.mode === "string" && MODES.has(params.mode) ? params.mode : "feeling-collapsed";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../assets/test-photos/shots/PickerCollapseShot") as {
    PickerCollapseShotInner?: React.ComponentType<{ mode: string }> | null;
  };
  const Inner = mod.PickerCollapseShotInner;
  if (!Inner) return <Redirect href="/" />;
  return <Inner mode={mode as "feeling-collapsed"} />;
}
