import { layout, space } from "@/theme";

/**
 * Fallback for the frosted tab bar's full height (content + bottom inset pad)
 * before the first onLayout. Matches TabBar: paddingTop + item row + selection
 * mark (marginTop + height) + max(safe-area, space.md).
 */
export function fallbackTabBarHeight(safeBottom: number): number {
  const mark = space.sm + 4;
  const content = space.md + layout.iconButtonSize + mark;
  return content + Math.max(safeBottom, space.md);
}
