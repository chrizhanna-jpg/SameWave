import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApp } from "@/context/AppContext";

// Show the tutorial automatically on the first cold start (while
// onboardingComplete is false). After they finish or skip, cold starts
// go straight to sign-in or tabs. They can replay via the home screen.
//
// Show the full tutorial on the first cold start only. If the user
// kills the app mid-tutorial, open 2 can still show it until they tap
// "Let's start" / Skip (onboardingComplete is persisted before "/").
const TUTORIAL_OPENS = 1;

// Single decision point for "where should the user land right now?"
// Order:
//   1. Tutorial first — even before sign-in. Skipping the tutorial
//      counts as completing it (completeOnboarding flips the flag), so
//      this gate only fires while the user genuinely hasn't seen the
//      flow yet AND they're inside the first-N-opens window.
//   2. Required Google sign-in. If the tutorial has been seen but the
//      user isn't authenticated, send them to the sign-in screen.
//   3. Otherwise → home tabs.
//
// Routing the post-tutorial / post-sign-in transition through here
// (instead of jumping straight to /(tabs)) keeps the decision in one
// place: the rest of the app can simply navigate to "/" and trust this
// gate to land them in the right state.
export default function Index() {
  const { appOpenCount, hasHydrated, onboardingComplete } = useApp();
  const { isLoaded, isSignedIn } = useAuth();

  // Wait for AsyncStorage AND Clerk to hydrate before deciding. Without
  // these gates, a returning user is briefly marked as a first-open (or
  // unauthenticated) and we redirect them away before the persisted
  // state catches up — the tutorial / sign-in screen would then fire
  // on every cold start.
  if (!hasHydrated || !isLoaded) {
    return null;
  }

  if (!onboardingComplete && appOpenCount <= TUTORIAL_OPENS) {
    return <Redirect href="/onboarding" />;
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/(tabs)" />;
}
