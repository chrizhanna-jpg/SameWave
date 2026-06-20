import { Alert } from "react-native";

/**
 * Pro-only surfaces (AI suggest, watermark removal, etc.) stay disabled until
 * you flip `EXPO_PUBLIC_PRO_FEATURES_ENABLED=true` in a future release.
 */
export function areProFeaturesLaunched(): boolean {
  const raw = process.env.EXPO_PUBLIC_PRO_FEATURES_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function promptProFeatureComingSoon(featureLabel: string): void {
  Alert.alert(
    "Coming soon",
    `${featureLabel} will be available in a future update.`,
  );
}

/** Returns true when the caller should continue with the Pro action. */
export function gateProFeature(featureLabel: string): boolean {
  if (areProFeaturesLaunched()) return true;
  promptProFeatureComingSoon(featureLabel);
  return false;
}
