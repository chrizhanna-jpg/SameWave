import { Redirect } from "expo-router";
import { useApp } from "@/context/AppContext";

export default function Index() {
  const { onboardingComplete, hasHydrated } = useApp();

  // Wait for AsyncStorage to hydrate before deciding where to send the
  // user. Without this gate, a returning user is briefly marked
  // `onboardingComplete: false` (the default initial state) and we
  // redirect them to /onboarding before their persisted "true" value
  // arrives — the tutorial then fires on every cold start.
  if (!hasHydrated) {
    return null;
  }

  if (!onboardingComplete) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
