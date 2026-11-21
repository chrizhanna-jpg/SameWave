import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Txt } from "@/components/Txt";
import { EMOTIONS, emotionFor, type Emotion } from "@/data/emotions";
import { colors, radius, space, type } from "@/theme";

interface Props {
  value: string | null;
  onChange: (emotionId: string | null) => void;
}

/** Filter the flat emotion list by label (and id) as the person types. */
function filterEmotions(query: string): Emotion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...EMOTIONS];
  return EMOTIONS.filter((emotion) => {
    const label = emotion.label.toLowerCase();
    const id = emotion.id.toLowerCase();
    return label.startsWith(q) || label.includes(q) || id.startsWith(q) || id.includes(q);
  });
}

/**
 * Flat emotion picker. Search shortens the list live; with nothing typed
 * the full list is visible and scrollable to browse and tap.
 */
export function EmotionPicker({ value, onChange }: Props) {
  const selected = emotionFor(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selected);

  const matches = useMemo(() => filterEmotions(query), [query]);

  if (selected && !open) {
    return (
      <Pressable
        onPress={() => {
          setOpen(true);
          setQuery("");
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: true }}
        accessibilityLabel={`Feeling ${selected.label}. Tap to change.`}
        style={styles.chosen}
      >
        <Txt>{selected.label}</Txt>
        <Txt variant="quiet" tone="secondary">
          Change
        </Txt>
      </Pressable>
    );
  }

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search or browse"
        placeholderTextColor={colors.textQuiet}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.search}
        accessibilityLabel="Search emotions"
      />
      <View style={styles.list}>
        {matches.map((emotion) => {
          const on = emotion.id === value;
          return (
            <Pressable
              key={emotion.id}
              onPress={() => {
                onChange(emotion.id);
                setOpen(false);
                setQuery("");
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={emotion.label}
              style={[styles.row, on && styles.rowOn]}
            >
              <Txt>{emotion.label}</Txt>
            </Pressable>
          );
        })}
        {matches.length === 0 ? (
          <Txt tone="secondary" style={styles.empty}>
            No feeling matches that. Try another word.
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    ...type.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  list: { marginTop: space.sm, gap: space.xs },
  row: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.waterPale },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.waterPale,
  },
  empty: { padding: space.md },
});
