import { useSyncExternalStore } from "react";

/**
 * Lets a tab screen ask the bottom menu to step aside. Only the Ripple deck
 * uses it, and it always clears the request when it loses focus.
 */
let hidden = false;
const listeners = new Set<() => void>();

export function setTabBarHidden(next: boolean): void {
  if (hidden === next) return;
  hidden = next;
  listeners.forEach((cb) => cb());
}

export function isTabBarHidden(): boolean {
  return hidden;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(subscribe, isTabBarHidden, isTabBarHidden);
}
