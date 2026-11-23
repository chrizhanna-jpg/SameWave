import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

import { testPhotosBuildEnabled } from "@/core/testPhotos";

const MODES = new Set([
  "both-empty",
  "both-collapsed",
  "feeling-collapsed",
  "feeling-open",
  "topic-collapsed",
  "topic-open",
]);

/** Preview-only picker collapse shots. */
export default function PickerCollapseShotScreen() {
  if (!testPhotosBuildEnabled()) return <Redirect href="/" />;
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode =
    typeof params.mode === "string" && MODES.has(params.mode) ? params.mode : "both-empty";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../assets/test-photos/shots/PickerCollapseShot") as {
    PickerCollapseShotInner?: React.ComponentType<{ mode: string }> | null;
  };
  const Inner = mod.PickerCollapseShotInner;
  if (!Inner) return <Redirect href="/" />;
  return <Inner mode={mode as "both-empty"} />;
}
