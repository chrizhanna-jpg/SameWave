import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Txt } from "@/components/Txt";
import { emotionFor, filterEmotions, type Emotion } from "@/data/emotions";
import { colors, radius, space, type } from "@/theme";

interface Props {
  value: string | null;
  onChange: (emotionId: string | null) => void;
  /** Fired when the search field gains or loses focus (keyboard layout). */
  onSearchFocusChange?: (focused: boolean) => void;
  /** When true, keep the list closed (e.g. while uploading). */
  locked?: boolean;
}

/**
 * Type-ahead Feeling picker — preset Feelings only.
 * Default: input only. Typing shows a short dropdown of plain labels
 * (~6). Synonyms match behind the scenes; never free text.
 */
export function EmotionPicker({ value, onChange, onSearchFocusChange, locked = false }: Props) {
  const selected = emotionFor(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selected);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  const trimmed = query.trim();
  const matches = useMemo(
    () => (trimmed ? filterEmotions(trimmed) : []),
    [trimmed],
  );
  // Suggestions only after the person starts typing — never an empty-state chip row.
  const showList = !locked && trimmed.length > 0 && (selected ? open : true);

  if (selected && (!open || locked)) {
    return (
      <Pressable
        onPress={() => {
          if (locked) return;
          setOpen(true);
          setQuery("");
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: true }}
        accessibilityLabel={`Feeling ${selected.label}. Tap to change.`}
        style={styles.chosen}
      >
        <Txt>{selected.label}</Txt>
        {!locked ? (
          <Txt variant="quiet" tone="secondary">
            Change
          </Txt>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="This feels…"
        placeholderTextColor={colors.textQuiet}
        autoCorrect={false}
        autoCapitalize="none"
        editable={!locked}
        style={styles.search}
        accessibilityLabel="This feels…"
        onFocus={() => {
          if (locked) return;
          onSearchFocusChange?.(true);
        }}
        onBlur={() => onSearchFocusChange?.(false)}
      />
      {showList ? (
        <View style={styles.list}>
          {matches.map((emotion) => {
            const on = emotion.id === value;
            return (
              <Row
                key={emotion.id}
                emotion={emotion}
                selected={on}
                onPress={() => {
                  onChange(emotion.id);
                  setOpen(false);
                  setQuery("");
                }}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Row({
  emotion,
  selected,
  onPress,
}: {
  emotion: Emotion;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={emotion.label}
      style={[styles.row, selected && styles.rowOn]}
    >
      <Txt>{emotion.label}</Txt>
    </Pressable>
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
    paddingVertical: space.sm,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 44,
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
});