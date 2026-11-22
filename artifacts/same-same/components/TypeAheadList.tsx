/**
 * Shared Feeling / Topic suggestion list: plain labels, opaque panel,
 * body-sized type (~16), ~48pt rows. Parent caps how many rows so the
 * whole list fits on screen above the keyboard (no inner scroll, no clip).
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Txt } from "@/components/Txt";
import { TYPEAHEAD_ROW_HEIGHT } from "@/core/typeAheadFit";
import { colors, font, radius, space } from "@/theme";

interface RowItem {
  id: string;
  label: string;
}

interface Props {
  items: readonly RowItem[];
  selectedId: string | null;
  onPick: (id: string) => void;
}

export function TypeAheadList({ items, selectedId, onPick }: Props) {
  if (items.length === 0) return null;
  return (
    <View style={styles.list} accessibilityRole="list">
      {items.map((item) => {
        const on = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            onPress={() => onPick(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={item.label}
            style={[styles.row, on && styles.rowOn]}
          >
            <Txt style={styles.label} numberOfLines={1}>
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: space.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: space.xs,
    // Solid white behind body text over the frosted / photo scene (WCAG AA).
    shadowColor: "#3F4A4B",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  row: {
    minHeight: TYPEAHEAD_ROW_HEIGHT,
    paddingHorizontal: space.md,
    justifyContent: "center",
  },
  rowOn: { backgroundColor: colors.waterPale },
  label: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
});
