import React, { useCallback } from "react";

import { TypeAheadPicker } from "@/components/TypeAheadPicker";
import type { ScreenScroll } from "@/components/Screen";
import { filterTopics, topicFor } from "@/data/topics";

interface Props {
  value: string | null;
  onChange: (topicId: string | null) => void;
  /** Fired when the search field gains or loses focus (keyboard layout). */
  onSearchFocusChange?: (focused: boolean) => void;
  /** When true, keep the list closed (e.g. while uploading). */
  locked?: boolean;
  scrollRef?: React.MutableRefObject<ScreenScroll | null>;
  scrollYRef?: React.MutableRefObject<number>;
}

/**
 * Type-ahead Topic picker — preset Topics only.
 * Collapses to the picked label; tap to type again.
 * Daily/Today topic stays on Home / the locked compose chip — not here.
 */
export function TopicPicker({
  value,
  onChange,
  onSearchFocusChange,
  locked = false,
  scrollRef,
  scrollYRef,
}: Props) {
  const selected = topicFor(value);
  const filter = useCallback(
    (query: string, maxRows: number) => filterTopics(query, maxRows),
    [],
  );

  return (
    <TypeAheadPicker
      value={value}
      selectedLabel={selected?.label ?? null}
      onChange={onChange}
      filter={filter}
      placeholder="Type a topic"
      searchAccessibilityLabel="Search Topics"
      valueKind="Topic"
      onSearchFocusChange={onSearchFocusChange}
      locked={locked}
      scrollRef={scrollRef}
      scrollYRef={scrollYRef}
    />
  );
}
