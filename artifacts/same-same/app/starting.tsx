import React from "react";

import { Waiting } from "@/components/Waiting";
import { useAppState } from "@/state/AppState";

/**
 * Between Clerk sign-in and the app knowing the account (country / local
 * profile). Used to be a bare RippleRings with no escape when /users/me or
 * getToken hung after setActive.
 */
export default function StartingScreen() {
  const { boot, bootDetail, retryBoot } = useAppState();

  if (boot === "failed") {
    return (
      <Waiting
        message="Couldn't finish signing in"
        detail={
          bootDetail ??
          "Check your connection. The SameWave server may be waking up — try again in a moment."
        }
        onRetry={retryBoot}
      />
    );
  }

  if (boot === "slow") {
    return (
      <Waiting
        message="Still getting ready…"
        detail={
          bootDetail ??
          "SameWave's server can take a minute to wake after it has been idle."
        }
        onRetry={retryBoot}
      />
    );
  }

  return <Waiting message="Getting your account ready…" />;
}
