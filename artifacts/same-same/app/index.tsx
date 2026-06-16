import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApp } from "@/context/AppContext";

// Single decision point for "where should the user land right now?"
// First-time flow (production AAB):
//   1. Tutorial once (`onboardingComplete` — persisted when onboarding finishes)
//   2. Google sign-in
//   3. Home tabs
// Replay tutorial from Home uses resetOnboarding() — does not affect this gate
// until the user finishes/skips again. Legacy installs without the flag are
// treated as complete if they already have match/echo history.
//
// Routing post-tutorial / post-sign-in through "/" keeps the decision in
// one place instead of hard-coding /(tabs) after OAuth.
export default function Index() {
  const { hasHydrated, onboardingComplete } = useApp();
  const { isLoaded, isSignedIn } = useAuth();

  // Route from local cache as soon as AsyncStorage hydrates — do not wait
  // for Clerk or server sync (Home / Atlas show a header sync spinner).
  if (!hasHydrated) {
    return null;
  }

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href="/(tabs)" />;
}
