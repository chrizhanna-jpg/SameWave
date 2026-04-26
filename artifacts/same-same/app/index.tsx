import { Redirect } from "expo-router";
import { useApp } from "@/context/AppContext";

// Show the tutorial automatically on the first N cold starts so the
// brand + flow has a chance to land before the user is dropped on the
// home tab. After this threshold, cold starts go straight to /(tabs)
// — the user can still open the tutorial manually via the "Replay
// tutorial" button on the home screen.
const TUTORIAL_OPENS = 3;

export default function Index() {
  const { appOpenCount, hasHydrated } = useApp();

  // Wait for AsyncStorage to hydrate before deciding where to send the
  // user. Without this gate, a returning user is briefly marked as a
  // first-open (the default initial state) and we redirect them to
  // /onboarding before their persisted counter arrives — the tutorial
  // would then fire on every cold start.
  if (!hasHydrated) {
    return null;
  }

  if (appOpenCount <= TUTORIAL_OPENS) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
