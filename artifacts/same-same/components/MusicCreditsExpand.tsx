import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Txt } from "@/components/Txt";
import { MUSIC_CREDIT, MUSIC_TRACK_CREDITS } from "@/data/vibes";
import { colors, space } from "@/theme";

/**
 * Account footer: collapsed by default to a single "Music credits" control.
 * Expanded list keeps every CC BY attribution (title / author / source / licence).
 */
export function MusicCreditsExpand() {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "Hide music credits" : "Show music credits"}
        style={styles.button}
      >
        <Txt tone="primary" center>
          Music credits
        </Txt>
      </Pressable>
      {open ? (
        <View style={styles.list} accessibilityRole="summary">
          <Txt variant="quiet" tone="secondary" center style={styles.summary}>
            {MUSIC_CREDIT}
          </Txt>
          {MUSIC_TRACK_CREDITS.map((line) => (
            <Txt key={line} variant="quiet" tone="secondary" center style={styles.track}>
              {line}
            </Txt>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg, alignItems: "center" },
  button: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    minWidth: 160,
  },
  list: { marginTop: space.sm, alignSelf: "stretch" },
  summary: { marginBottom: space.xs },
  track: { marginTop: space.xs, paddingHorizontal: space.md },
});
