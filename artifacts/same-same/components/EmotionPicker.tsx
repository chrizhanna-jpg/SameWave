import React, { useCallback } from "react";

import { TypeAheadPicker } from "@/components/TypeAheadPicker";
import type { ScreenScroll } from "@/components/Screen";
import { emotionFor, filterEmotions } from "@/data/emotions";

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
 * Collapses to the picked label; tap to type again.
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
  const filter = useCallback(
    (query: string, maxRows: number) => filterEmotions(query, maxRows),
    [],
  );

  return (
    <TypeAheadPicker
      value={value}
      selectedLabel={selected?.label ?? null}
      onChange={onChange}
      filter={filter}
      placeholder="This feels…"
      searchAccessibilityLabel="This feels…"
      valueKind="Feeling"
      onSearchFocusChange={onSearchFocusChange}
      locked={locked}
      scrollRef={scrollRef}
      scrollYRef={scrollYRef}
    />
  );
}
