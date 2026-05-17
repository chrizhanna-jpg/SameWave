import type { IconName } from "@/components/Icon";
import { ATLAS_FIRE_EMPTY, ATLAS_FILTER_A11Y } from "@/data/waveRippleGlossary";

export type AtlasFireMode = "wavefire" | "ripplefire";

export type AtlasFireArcGlowLayer = { w: number; color: string; o: number };

export type AtlasFireVisual = {
  mode: AtlasFireMode;
  label: string;
  filterIcon: IconName;
  statA11y: string;
  emptyHint: string;
  emberCore: string;
  lineStroke: string;
  arcGlowLayers: AtlasFireArcGlowLayer[];
  continentFill: string;
  continentStroke: string;
  centroidDotFill: string;
  campGlow: string;
  campMid: string;
  campHot: string;
  campSpark: string;
  chipIdleBg: string;
  chipIdleBorder: string;
  chipActiveBg: string;
  chipActiveBorder: string;
  chipShadowColor: string;
};

export const WAVEFIRE_VISUAL: AtlasFireVisual = {
  mode: "wavefire",
  label: "Wavefire",
  filterIcon: "campfire",
  statA11y: ATLAS_FILTER_A11Y.wavefire,
  emptyHint: ATLAS_FIRE_EMPTY.wavefire,
  emberCore: "#fb923c",
  lineStroke: "#ff6b35",
  arcGlowLayers: [
    { w: 12, color: "#7c2d12", o: 0.14 },
    { w: 7.5, color: "#ea580c", o: 0.22 },
    { w: 4.5, color: "#fb923c", o: 0.4 },
    { w: 2, color: "#fde68a", o: 0.72 },
  ],
  continentFill: "rgba(22, 60, 126, 0.92)",
  continentStroke: "rgba(255, 209, 102, 0.32)",
  centroidDotFill: "rgba(255, 209, 102, 0.42)",
  campGlow: "#ff6b35",
  campMid: "#7c2d12",
  campHot: "#fb923c",
  campSpark: "#fde68a",
  chipIdleBg: "rgba(255, 107, 53, 0.1)",
  chipIdleBorder: "rgba(255, 107, 53, 0.32)",
  chipActiveBg: "rgba(251, 146, 60, 0.22)",
  chipActiveBorder: "rgba(255, 180, 120, 0.55)",
  chipShadowColor: "#ff6b35",
};

/** Softer teal ripple palette — same mechanics, less intense than Wavefire. */
export const RIPPLEFIRE_VISUAL: AtlasFireVisual = {
  mode: "ripplefire",
  label: "Ripplefire",
  filterIcon: "campfire",
  statA11y: ATLAS_FILTER_A11Y.ripplefire,
  emptyHint: ATLAS_FIRE_EMPTY.ripplefire,
  emberCore: "#6ee7b7",
  lineStroke: "#4FD89C",
  arcGlowLayers: [
    { w: 12, color: "#064e3b", o: 0.09 },
    { w: 7.5, color: "#0f766e", o: 0.14 },
    { w: 4.5, color: "#2dd4bf", o: 0.26 },
    { w: 2, color: "#a7f3d0", o: 0.48 },
  ],
  continentFill: "rgba(18, 52, 72, 0.92)",
  continentStroke: "rgba(79, 216, 156, 0.28)",
  centroidDotFill: "rgba(79, 216, 156, 0.38)",
  campGlow: "#4FD89C",
  campMid: "#0f766e",
  campHot: "#6ee7b7",
  campSpark: "#ccfbf1",
  chipIdleBg: "rgba(79, 216, 156, 0.08)",
  chipIdleBorder: "rgba(79, 216, 156, 0.28)",
  chipActiveBg: "rgba(45, 212, 191, 0.16)",
  chipActiveBorder: "rgba(110, 231, 183, 0.45)",
  chipShadowColor: "#4FD89C",
};

export function atlasFireVisual(mode: AtlasFireMode): AtlasFireVisual {
  return mode === "wavefire" ? WAVEFIRE_VISUAL : RIPPLEFIRE_VISUAL;
}
