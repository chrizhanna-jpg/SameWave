import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fallbackTabBarHeight } from "@/core/tabBarHeight";
import { space } from "@/theme";

export { fallbackTabBarHeight } from "@/core/tabBarHeight";

type TabBarHeightApi = {
  /** Full overlay height from the screen bottom, including safe-area pad. */
  height: number;
  /** TabBar calls this from onLayout with the measured bar height. */
  setHeight: (height: number) => void;
};

const TabBarHeightContext = createContext<TabBarHeightApi | null>(null);

/** Holds the measured frosted tab bar height for tab screens. */
export function TabBarHeightProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const fallback = fallbackTabBarHeight(insets.bottom);
  const [measured, setMeasured] = useState<number | null>(null);

  const setHeight = useCallback((height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    setMeasured((current) => (current != null && Math.abs(current - height) < 0.5 ? current : height));
  }, []);

  const value = useMemo(
    () => ({ height: measured ?? fallback, setHeight }),
    [measured, fallback, setHeight],
  );

  return <TabBarHeightContext.Provider value={value}>{children}</TabBarHeightContext.Provider>;
}

/** Full tab-bar overlay height (measured when possible). */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  const ctx = useContext(TabBarHeightContext);
  return ctx?.height ?? fallbackTabBarHeight(insets.bottom);
}

/** Bottom padding so content clears the overlaying tab bar by `gap`. */
export function useTabBarClearance(gap: number = space.md): number {
  return useTabBarHeight() + gap;
}

/** TabBar uses this to publish its measured height. */
export function useReportTabBarHeight(): (height: number) => void {
  const ctx = useContext(TabBarHeightContext);
  return ctx?.setHeight ?? (() => undefined);
}
