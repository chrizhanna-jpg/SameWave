import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { Txt } from "@/components/Txt";
import { filterTopics, topicFor, type Topic } from "@/data/topics";
import { colors, radius, space, type } from "@/theme";

interface Props {
  value: string | null;
  onChange: (topicId: string | null) => void;
  /** Fired when the search field gains or loses focus (keyboard layout). */
  onSearchFocusChange?: (focused: boolean) => void;
  /** When true, keep the list closed (e.g. while uploading). */
  locked?: boolean;
}

/**
 * Type-ahead Topic picker — preset Topics only.
 * Typing filters/suggests; tapping a row saves that preset id. Never free text.
 * Empty search shows popular starters; a miss shows the closest presets.
 */
export function TopicPicker({ value, onChange, onSearchFocusChange, locked = false }: Props) {
  const selected = topicFor(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selected);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  const matches = useMemo(() => filterTopics(query), [query]);
  const showList = !locked && (selected ? open : true);

  if (selected && (!open || locked)) {
    return (
      <Pressable
        onPress={() => {
          if (locked) return;
          setOpen(true);
          setQuery("");
        }}
        accessibilityRole="button"
        accessibilityLabel={`Topic ${selected.label}. Tap to change.`}
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
        placeholder="Type a topic"
        placeholderTextColor={colors.textQuiet}
        autoCorrect={false}
        autoCapitalize="none"
        editable={!locked}
        style={styles.search}
        accessibilityLabel="Search Topics"
        onFocus={() => {
          if (locked) return;
          onSearchFocusChange?.(true);
        }}
        onBlur={() => onSearchFocusChange?.(false)}
      />
      {showList ? (
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
        </View>
      ) : null}
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
      accessibilityLabel={`${topic.label}. ${topic.description}`}
      style={[styles.row, selected && styles.rowOn]}
    >
      <Txt>{topic.label}</Txt>
      <Txt variant="quiet" tone="secondary">
        {topic.description}
      </Txt>
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
    gap: 2,
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