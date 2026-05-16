import React from "react";

import { MatchContextChips } from "@/components/MatchContextChips";
import type { GeoTier, TimeTier } from "@/utils/celebrations";
import type { ShareLayoutTokens } from "@/utils/shareLayoutTokens";

type CelebrationMatchChipsProps = {
  themeTitle: string;
  themeEmoji: string;
  timeTier: TimeTier;
  geoTier: GeoTier;
  onDark?: boolean;
  layout?: ShareLayoutTokens;
  accentColor?: string;
};

/** Ripple/Wave flash overlay chips — theme above, meta beside each other. */
export function CelebrationMatchChips(props: CelebrationMatchChipsProps) {
  return (
    <MatchContextChips
      mode="flash"
      align="center"
      accentColor={props.accentColor}
      onDark={props.onDark}
      layout={props.layout}
      themeTitle={props.themeTitle}
      themeEmoji={props.themeEmoji}
      timeTier={props.timeTier}
      geoTier={props.geoTier}
    />
  );
}
