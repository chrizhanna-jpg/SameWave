/**
 * Shared Feeling / Topic type-ahead: input until a preset is picked, then a
 * single compact value box. Tap the box to edit again (list only while typing).
 * Parent can disable the field (greyed, non-expandable) for sequencing.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { TypeAheadList } from "@/components/TypeAheadList";
import { Txt } from "@/components/Txt";
import type { ScreenScroll } from "@/components/Screen";
import { useTypeAheadFit } from "@/hooks/useTypeAheadFit";
import { colors, font, radius, space, type } from "@/theme";

type MeasurableHost = {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

type FocusableInput = {
  focus?: () => void;
};

export type TypeAheadItem = { id: string; label: string };

export interface TypeAheadPickerProps {
  value: string | null;
  selectedLabel: string | null;
  onChange: (id: string | null) => void;
  filter: (query: string, maxRows: number) => readonly TypeAheadItem[];
  placeholder: string;
  searchAccessibilityLabel: string;
  /** Prefix for the collapsed a11y label, e.g. "Feeling" / "Topic". */
  valueKind: string;
  /** Fired when the search field gains or loses focus (keyboard layout). */
  onSearchFocusChange?: (focused: boolean) => void;
  /** When true, keep collapsed (e.g. while uploading). */
  locked?: boolean;
  /** Greyed, non-interactive (optional; unused on the Ripple tab). */
  disabled?: boolean;
  /** Idle label when disabled and nothing is selected. */
  disabledLabel?: string;
  /** Bump to focus the input once (e.g. parent-driven open). */
  focusToken?: number;
  /** Preview / test: seed the search field (also opens the field). */
  initialQuery?: string;
  scrollRef?: React.MutableRefObject<ScreenScroll | null>;
  scrollYRef?: React.MutableRefObject<number>;
}

export function TypeAheadPicker({
  value,
  selectedLabel,
  onChange,
  filter,
  placeholder,
  searchAccessibilityLabel,
  valueKind,
  onSearchFocusChange,
  locked = false,
  disabled = false,
  disabledLabel,
  focusToken = 0,
  initialQuery,
  scrollRef,
  scrollYRef,
}: TypeAheadPickerProps) {
  const selected = Boolean(value && selectedLabel);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [open, setOpen] = useState(!selected || Boolean(initialQuery));
  const fieldRef = useRef<MeasurableHost | null>(null);
  // RN 0.88 TextInput ref typings omit focus(); keep a narrow focusable host.
  const inputRef = useRef<FocusableInput | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Focus only after tap-to-edit or a parent focusToken bump — not on first mount. */
  const wantFocus = useRef(false);
  const lastFocusToken = useRef(focusToken);

  useEffect(() => {
    if (locked || disabled) setOpen(false);
  }, [locked, disabled]);

  useEffect(() => {
    if (disabled || locked) return;
    if (focusToken === lastFocusToken.current) return;
    lastFocusToken.current = focusToken;
    if (focusToken <= 0) return;
    wantFocus.current = true;
    setOpen(true);
  }, [focusToken, disabled, locked]);

  useEffect(() => {
    if (!open || disabled || locked || !wantFocus.current) return;
    wantFocus.current = false;
    const t = setTimeout(() => inputRef.current?.focus?.(), 40);
    return () => clearTimeout(t);
  }, [open, disabled, locked]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const trimmed = query.trim();
  const active = !locked && !disabled && trimmed.length > 0 && (selected ? open : true);
  const { maxRows } = useTypeAheadFit({
    active,
    scrollRef,
    fieldRef,
    scrollYRef,
  });
  const matches = useMemo(
    () => (trimmed ? filter(trimmed, maxRows) : []),
    [trimmed, maxRows, filter],
  );

  const collapse = () => {
    setOpen(false);
    setQuery("");
    Keyboard.dismiss();
  };

  if (disabled) {
    return (
      <View
        style={[styles.chosen, styles.chosenDisabled]}
        accessibilityState={{ disabled: true }}
        accessibilityLabel={
          selected && selectedLabel
            ? `${valueKind} ${selectedLabel}. Unavailable.`
            : (disabledLabel ?? `${valueKind} unavailable.`)
        }
      >
        <Txt style={[styles.chosenLabel, styles.chosenLabelDisabled]} numberOfLines={1}>
          {selected && selectedLabel
            ? selectedLabel
            : (disabledLabel ?? placeholder)}
        </Txt>
      </View>
    );
  }

  if (selected && selectedLabel && (!open || locked)) {
    return (
      <Pressable
        onPress={() => {
          if (locked) return;
          wantFocus.current = true;
          setOpen(true);
          setQuery("");
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: true }}
        accessibilityLabel={`${valueKind} ${selectedLabel}. Tap to change.`}
        style={styles.chosen}
      >
        <Txt style={styles.chosenLabel} numberOfLines={1}>
          {selectedLabel}
        </Txt>
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
        ref={(node) => {
          inputRef.current = node;
        }}
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={colors.textQuiet}
        autoCorrect={false}
        autoCapitalize="none"
        editable={!locked && !disabled}
        style={styles.search}
        accessibilityLabel={searchAccessibilityLabel}
        onFocus={() => {
          if (locked || disabled) return;
          if (blurTimer.current) {
            clearTimeout(blurTimer.current);
            blurTimer.current = null;
          }
          onSearchFocusChange?.(true);
        }}
        onBlur={() => {
          onSearchFocusChange?.(false);
          // Delay so a list tap can fire onPick before we collapse.
          if (blurTimer.current) clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => {
            blurTimer.current = null;
            if (selected) collapse();
          }, 180);
        }}
      />
      {active ? (
        <TypeAheadList
          items={matches}
          selectedId={value}
          onPick={(id) => {
            if (blurTimer.current) {
              clearTimeout(blurTimer.current);
              blurTimer.current = null;
            }
            onChange(id);
            collapse();
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
    paddingHorizontal: space.md,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.waterPale,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chosenDisabled: {
    backgroundColor: colors.surface,
    opacity: 0.72,
  },
  chosenLabel: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  chosenLabelDisabled: {
    color: colors.textQuiet,
  },
});
