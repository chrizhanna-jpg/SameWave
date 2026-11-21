import { layout, space } from "@/theme";

/**
 * Fallback for the frosted tab bar's full height (content + bottom inset pad)
 * before the first onLayout. Matches TabBar: paddingTop + item row +
 * max(safe-area, space.md).
 */
export function fallbackTabBarHeight(safeBottom: number): number {
  const content = space.md + layout.iconButtonSize;
  return content + Math.max(safeBottom, space.md);
}
