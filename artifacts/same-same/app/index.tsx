import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApp } from "@/context/AppContext";

// Single decision point for "where should the user land right now?"
// First-time flow (production AAB):
//   1. Tutorial once (`onboardingComplete` persisted before leaving /onboarding)
//   2. Google sign-in
//   3. Home tabs
// Replay tutorial from Home uses resetOnboarding() — does not affect this gate
// until the user finishes/skips again.
//
// Routing post-tutorial / post-sign-in through "/" keeps the decision in
// one place instead of hard-coding /(tabs) after OAuth.
export default function Index() {
  const { hasHydrated, onboardingComplete } = useApp();
  const { isLoaded, isSignedIn } = useAuth();

  // Wait for AsyncStorage AND Clerk to hydrate before deciding. Without
  // these gates, a returning user is briefly marked as a first-open (or
  // unauthenticated) and we redirect them away before the persisted
  // state catches up — the tutorial / sign-in screen would then fire
  // on every cold start.
  if (!hasHydrated || !isLoaded) {
    return null;
  }

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/(tabs)" />;
}
