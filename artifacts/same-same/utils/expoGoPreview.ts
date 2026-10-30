import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/**
 * Expo Go cannot receive Clerk's `echo.samewaveripple.app://callback` OAuth
 * redirect (an installed SameWave build on the phone steals it), so Google
 * sign-in never completes in a phone preview. When Metro is started with
 * `EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN=1` (see
 * `scripts/expo-go-preview.sh`), routing treats the user as signed in so the
 * navigation and screens can be reviewed.
 *
 * Gated on a dev bundle, an explicit env flag, and Expo Go (or the web dev
 * bundle, used for headless checks) so it can never take effect in a store or
 * development build.
 */
export const EXPO_GO_PREVIEW_SKIP_SIGN_IN =
  __DEV__ &&
  process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN === "1" &&
  (Platform.OS === "web" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

/** Shown in the on-screen badge so the preview bundle is unmistakable. */
export const EXPO_GO_PREVIEW_LABEL =
  process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW_LABEL?.trim() || "Expo Go preview";
