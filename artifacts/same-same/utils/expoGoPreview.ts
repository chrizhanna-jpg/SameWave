import Constants, { ExecutionEnvironment } from "expo-constants";

/**
 * Expo Go cannot receive Clerk's `echo.samewaveripple.app://callback` OAuth
 * redirect, so Google sign-in never completes in a phone preview. When Metro is
 * started with `EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN=1`, routing treats the
 * user as signed in so the navigation and screens can be reviewed.
 *
 * Triple-gated (dev bundle + Expo Go + explicit env flag) so it can never take
 * effect in a store or development build.
 */
export const EXPO_GO_PREVIEW_SKIP_SIGN_IN =
  __DEV__ &&
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
  process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN === "1";
