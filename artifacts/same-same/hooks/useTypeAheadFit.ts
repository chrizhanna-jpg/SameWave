/**
 * Caps type-ahead rows so the whole suggestion panel fits above the keyboard,
 * and scrolls the compose screen so the list is not clipped.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ScreenScroll } from "@/components/Screen";
import {
  TYPEAHEAD_MAX_ROWS,
  typeAheadListHeight,
  typeAheadRowsThatFit,
} from "@/core/typeAheadFit";

const INPUT_GAP = 8;

type Measurable = {
  measureInWindow?: (
    callback: (x: number, y: number, w: number, h: number) => void,
  ) => void;
};

export function useTypeAheadFit(options: {
  active: boolean;
  scrollRef?: React.MutableRefObject<ScreenScroll | null>;
  /** Host view around the TextInput — used to measure space above the keyboard. */
  fieldRef?: React.RefObject<Measurable | null> | React.MutableRefObject<Measurable | null>;
  /** Current ScrollView offset — Compose tracks this via Screen onScroll. */
  scrollYRef?: React.MutableRefObject<number>;
}) {
  // RN 0.88 View ref typings are awkward — callers pass a View ref cast at the call site.
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [maxRows, setMaxRows] = useState(TYPEAHEAD_MAX_ROWS);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setKeyboardHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const recompute = useCallback(() => {
    const field = options.fieldRef?.current;
    if (!field || !options.active) {
      // No measure yet — leave room for keyboard on a small phone.
      const visible = windowHeight - keyboardHeight - insets.top - 180;
      setMaxRows(typeAheadRowsThatFit(visible, TYPEAHEAD_MAX_ROWS));
      return;
    }
    if (typeof field.measureInWindow !== "function") {
      const visible = windowHeight - keyboardHeight - insets.top - 180;
      setMaxRows(typeAheadRowsThatFit(visible, TYPEAHEAD_MAX_ROWS));
      return;
    }
    field.measureInWindow((_x, y, _w, h) => {
      const visibleBottom = windowHeight - keyboardHeight - Math.max(insets.bottom, 6);
      const roomBelow = Math.max(0, visibleBottom - (y + h) - INPUT_GAP);
      let rows = typeAheadRowsThatFit(roomBelow, TYPEAHEAD_MAX_ROWS);
      const listH = typeAheadListHeight(rows);
      const listBottom = y + h + INPUT_GAP + listH;

      if (listBottom > visibleBottom && options.scrollRef?.current) {
        const overflow = listBottom - visibleBottom + 16;
        const currentY = options.scrollYRef?.current ?? 0;
        options.scrollRef.current.scrollTo({
          y: Math.max(0, currentY + overflow),
          animated: true,
        });
        // After scrolling, room below the field grows by ~overflow.
        rows = typeAheadRowsThatFit(roomBelow + overflow, TYPEAHEAD_MAX_ROWS);
      }
      setMaxRows(rows);
    });
  }, [
    options.active,
    options.fieldRef,
    options.scrollRef,
    options.scrollYRef,
    keyboardHeight,
    windowHeight,
    insets.bottom,
    insets.top,
  ]);

  useEffect(() => {
    if (!options.active) {
      setMaxRows(TYPEAHEAD_MAX_ROWS);
      return;
    }
    const t = setTimeout(recompute, Platform.OS === "ios" ? 50 : 100);
    return () => clearTimeout(t);
  }, [options.active, keyboardHeight, recompute]);

  return { maxRows, recompute, keyboardHeight };
}

/** Track ScrollView offset for type-ahead scroll compensation. */
export function onScrollY(
  scrollYRef: React.MutableRefObject<number>,
  event: NativeSyntheticEvent<NativeScrollEvent>,
): void {
  scrollYRef.current = event.nativeEvent.contentOffset.y;
}
