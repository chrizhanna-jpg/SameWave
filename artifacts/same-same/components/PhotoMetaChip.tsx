import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Scrim } from "@/components/Scrim";
import { Txt } from "@/components/Txt";
import { photoMetaChipText } from "@/core/photoMeta";
import { space } from "@/theme";

interface Props {
  /** Emotion id (`data/emotions`). */
  emotion?: string | null;
  /** Topic / theme id (`data/topics`). */
  topic?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Optional prefix, e.g. "You" / "Them" on the Discover sheet. */
  label?: string | null;
}

/**
 * Quiet feeling · topic line for a photograph. Never includes place.
 */
export function PhotoMetaChip({ emotion, topic, style, label }: Props) {
  const text = photoMetaChipText({ emotion, topic, label });
  if (!text) return null;

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <Scrim kind="light" style={styles.scrim}>
        <Txt variant="quiet" center>
          {text}
        </Txt>
      </Scrim>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  scrim: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});
