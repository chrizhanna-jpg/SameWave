import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Txt } from "@/components/Txt";
import { filterTopics, topicFor, type Topic } from "@/data/topics";
import { colors, radius, space, type } from "@/theme";

interface Props {
  value: string | null;
  onChange: (topicId: string | null) => void;
  /** Fired when the search field gains or loses focus (keyboard layout). */
  onSearchFocusChange?: (focused: boolean) => void;
}

/**
 * Preset-only Topic picker. Search shortens the flat list live; with an
 * empty search the full list stays visible and scrollable to browse.
 */
export function TopicPicker({ value, onChange, onSearchFocusChange }: Props) {
  const selected = topicFor(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selected);

  const matches = useMemo(() => filterTopics(query), [query]);

  if (selected && !open) {
    return (
      <Pressable
        onPress={() => {
          setOpen(true);
          setQuery("");
        }}
        accessibilityRole="button"
        accessibilityLabel={`Topic ${selected.label}. Tap to change.`}
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
        accessibilityLabel="Search Topics"
        onFocus={() => onSearchFocusChange?.(true)}
        onBlur={() => onSearchFocusChange?.(false)}
      />
      <View style={styles.list}>
        {matches.map((topic) => (
          <Row
            key={topic.id}
            topic={topic}
            selected={topic.id === value}
            onPress={() => {
              onChange(topic.id);
              setOpen(false);
              setQuery("");
            }}
          />
        ))}
        {matches.length === 0 ? (
          <Txt tone="secondary" style={styles.empty}>
            No Topic matches that. Try another word.
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function Row({
  topic,
  selected,
  onPress,
}: {
  topic: Topic;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.row, selected && styles.rowOn]}
    >
      <Txt>{topic.label}</Txt>
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
