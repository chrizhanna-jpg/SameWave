import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { TypeAheadList } from "@/components/TypeAheadList";
import { Txt } from "@/components/Txt";
import type { ScreenScroll } from "@/components/Screen";
import { emotionFor, filterEmotions } from "@/data/emotions";
import { useTypeAheadFit } from "@/hooks/useTypeAheadFit";
import { colors, font, radius, space, type } from "@/theme";

type MeasurableHost = {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

interface Props {
  value: string | null;
  onChange: (emotionId: string | null) => void;
  /** Fired when the search field gains or loses focus (keyboard layout). */
  onSearchFocusChange?: (focused: boolean) => void;
  /** When true, keep the list closed (e.g. while uploading). */
  locked?: boolean;
  scrollRef?: React.MutableRefObject<ScreenScroll | null>;
  scrollYRef?: React.MutableRefObject<number>;
}

/**
 * Type-ahead Feeling picker — preset Feelings only.
 * Default: input only. Typing shows a short plain-label dropdown that is
 * fully on-screen (fewer rows if the keyboard leaves less room).
 */
export function EmotionPicker({
  value,
  onChange,
  onSearchFocusChange,
  locked = false,
  scrollRef,
  scrollYRef,
}: Props) {
  const selected = emotionFor(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!selected);
  // RN 0.88 View ref typings disagree with useRef<View>; keep a measurable host.
  const fieldRef = useRef<MeasurableHost | null>(null);

  useEffect(() => {
    if (locked) setOpen(false);
  }, [locked]);

  const trimmed = query.trim();
  const active = !locked && trimmed.length > 0 && (selected ? open : true);
  const { maxRows } = useTypeAheadFit({
    active,
    scrollRef,
    fieldRef,
    scrollYRef,
  });
  const matches = useMemo(
    () => (trimmed ? filterEmotions(trimmed, maxRows) : []),
    [trimmed, maxRows],
  );

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
        <Txt style={styles.chosenLabel}>{selected.label}</Txt>
        {!locked ? (
          <Txt variant="quiet" tone="secondary">
            Change
          </Txt>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View
      ref={(node) => {
        fieldRef.current = node;
      }}
      collapsable={false}
    >
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
      {active ? (
        <TypeAheadList
          items={matches}
          selectedId={value}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
            setQuery("");
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    ...type.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.waterPale,
  },
  chosenLabel: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
});
