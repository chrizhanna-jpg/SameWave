import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { Scrim } from "@/components/Scrim";
import { Txt } from "@/components/Txt";
import { space } from "@/theme";

interface Props {
  /** From `matchBonuses(…).headline` — e.g. "Same month, same continent". */
  headline: string | null | undefined;
  /**
   * `photo` — dark Scrim over the full-screen pair (existing bottom chrome).
   * `sheet` — quiet text on a light bottom sheet (no Scrim card).
   */
  surface?: "photo" | "sheet";
  style?: StyleProp<ViewStyle>;
}

/**
 * Quiet one-liner for what two photos share. Same copy on the Wave chrome
 * and on the Discover pull-up sheet.
 */
export function WaveSimilarityLine({ headline, surface = "photo", style }: Props) {
  if (!headline) return null;

  if (surface === "sheet") {
    return (
      <Txt tone="secondary" center style={[styles.sheet, style]}>
        {headline}
      </Txt>
    );
  }

  return (
    <Scrim style={[styles.photo, style]}>
      <Txt tone="white" center overPhoto>
        {headline}
      </Txt>
    </Scrim>
  );
}

const styles = StyleSheet.create({
  photo: { marginBottom: space.sm },
  sheet: { marginBottom: space.md },
});
