import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/** Animations run off the JS thread on phones. The web has no such thread. */
export const NATIVE_DRIVER = Platform.OS !== "web";

/** True when the person has asked their phone for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
