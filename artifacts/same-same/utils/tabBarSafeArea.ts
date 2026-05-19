import { Platform } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

/** Icon + label row inside the tab bar (excluding system inset). */
export const TAB_BAR_INNER_HEIGHT = 56;
export const TAB_BAR_PADDING_TOP = 6;

/**
 * Typical height of Android 3-button navigation bar when safe-area
 * insets are missing (common on Samsung, Xiaomi, older devices).
 */
export const ANDROID_NAV_BAR_FALLBACK = 48;

/**
 * Bottom inset for the tab bar — clears home indicator (iOS) and
 * navigation bar (Android gesture or 3-button).
 *
 * Best practice: always read from `useSafeAreaInsets()`, but on Android
 * many OEMs report `bottom: 0` while still drawing 3-button nav on top
 * of the app. We reserve fallback space only when the reported inset is
 * suspiciously small.
 */
export function tabBarBottomInset(insets: EdgeInsets): number {
  if (Platform.OS === "web") return 0;
  if (Platform.OS === "ios") return insets.bottom;
  // Gesture nav (Pixel, etc.) usually reports ≥ 20dp.
  if (insets.bottom >= 20) return insets.bottom;
  return ANDROID_NAV_BAR_FALLBACK;
}

/** Full tab bar height including system inset (for layout / scroll padding). */
export function tabBarTotalHeight(insets: EdgeInsets): number {
  return TAB_BAR_PADDING_TOP + TAB_BAR_INNER_HEIGHT + tabBarBottomInset(insets);
}

/** Scroll content padding so the last items clear the floating tab bar. */
export function scrollPaddingAboveTabBar(
  insets: EdgeInsets,
  extra = 16,
): number {
  if (Platform.OS === "web") return 34 + 84 + extra;
  return tabBarTotalHeight(insets) + extra;
}
