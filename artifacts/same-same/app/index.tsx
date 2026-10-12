import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApp } from "@/context/AppContext";

// Single decision point for "where should the user land right now?"
// First-time flow (production AAB):
//   1. Tutorial on the first TWO launches:
//        - launch 1 via `onboardingComplete` (false until they finish/skip)
//        - launch 2 via the replay gate below, then it hides from launch 3 on
//   2. Google sign-in
//   3. Home tabs
// Replay tutorial from Home uses resetOnboarding() — does not affect this gate
// until the user finishes/skips again. Legacy installs without the flag are
// treated as complete if they already have match/echo history (and are seeded
// above the open-count threshold so the replay gate never fires for them).
//
// Routing post-tutorial / post-sign-in through "/" keeps the decision in
// one place instead of hard-coding /(tabs) after OAuth.
export default function Index() {
  const { hasHydrated, onboardingComplete, appOpenCount, tutorialLaunchAck } =
    useApp();
  const { isLoaded, isSignedIn } = useAuth();

  // Show the tutorial again on the user's SECOND launch. `tutorialLaunchAck`
  // is bumped to the current `appOpenCount` whenever they finish/skip, so it
  // trails the open count for exactly one more launch (launch 2) before
  // catching up — that breaks any redirect loop within a session and caps the
  // replay at the first two opens.
  const replayTutorial =
    appOpenCount <= 2 && tutorialLaunchAck < appOpenCount;

  // `<Redirect>` on Expo Router 57 re-runs its focus effect whenever the
  // callback identity changes, and each run calls `router.replace`. After
  // Google sign-in that stacks updates until React throws "Maximum update
  // depth exceeded". A stable href runs the replace once.
  const href = !hasHydrated
    ? null
    : !onboardingComplete || replayTutorial
      ? "/onboarding"
      : isLoaded && !isSignedIn
        ? "/sign-in"
        : isLoaded
          ? "/(tabs)"
          : null;

  useEffect(() => {
    if (!href) return;
    router.replace(href);
  }, [href]);

  return null;
}
