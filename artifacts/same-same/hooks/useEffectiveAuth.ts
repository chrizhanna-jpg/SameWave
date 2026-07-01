import { useAuth } from "@clerk/expo";

/** Local dev: skip Clerk sign-in when paired with api-server `DEV_BYPASS_AUTH=1`. */
export function isDevAuthBypassEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_DEV_BYPASS_AUTH === "1";
}

export function useEffectiveAuth(): {
  isLoaded: boolean;
  isSignedIn: boolean;
} {
  const clerk = useAuth();
  if (isDevAuthBypassEnabled()) {
    return { isLoaded: true, isSignedIn: true };
  }
  return { isLoaded: clerk.isLoaded, isSignedIn: clerk.isSignedIn };
}
