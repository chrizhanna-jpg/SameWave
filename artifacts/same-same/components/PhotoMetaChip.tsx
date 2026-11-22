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
  /**
   * When true (Match action row), single-line ellipsis so a long feeling·topic
   * never overlaps the flanking SoftIconDisc buttons on a 360-wide phone.
   */
  compact?: boolean;
}

/**
 * Quiet feeling · topic line for a photograph. Never includes place.
 */
export function PhotoMetaChip({ emotion, topic, style, label, compact = false }: Props) {
  const text = photoMetaChipText({ emotion, topic, label });
  if (!text) return null;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]} pointerEvents="none">
      <Scrim kind="light" style={[styles.scrim, compact && styles.scrimCompact]}>
        <Txt
          variant="quiet"
          center
          numberOfLines={compact ? 1 : undefined}
          ellipsizeMode={compact ? "tail" : undefined}
        >
          {text}
        </Txt>
      </Scrim>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  wrapCompact: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    paddingHorizontal: space.sm,
  },
  scrim: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  scrimCompact: {
    maxWidth: "100%",
    paddingHorizontal: space.sm,
  },
});
