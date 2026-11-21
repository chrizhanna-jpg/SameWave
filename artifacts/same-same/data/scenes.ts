/**
 * Full-bleed calm scenes for Style 3 (frosted panels over a photograph).
 * Files live in assets/scenes/; licence notes in assets/scenes/ATTRIBUTION.md.
 */
import type { ImageSourcePropType } from "react-native";

export type SceneId =
  | "mistLake"
  | "mistLakeNoboat"
  | "softPeaks"
  | "quietShore"
  | "openSky";

export const scenes: Record<SceneId, ImageSourcePropType> = {
  mistLake: require("../assets/scenes/mist-lake.jpg"),
  mistLakeNoboat: require("../assets/scenes/mist-lake-noboat.jpg"),
  softPeaks: require("../assets/scenes/soft-peaks.jpg"),
  quietShore: require("../assets/scenes/quiet-shore.jpg"),
  openSky: require("../assets/scenes/open-sky.jpg"),
};

/** Stable scene picks per surface so the look stays familiar. */
export const sceneFor = {
  home: "mistLakeNoboat" as SceneId,
  waves: "openSky" as SceneId,
  account: "quietShore" as SceneId,
  howItWorks: "softPeaks" as SceneId,
  signIn: "mistLake" as SceneId,
  starting: "mistLake" as SceneId,
  country: "softPeaks" as SceneId,
  composeFallback: "quietShore" as SceneId,
};
