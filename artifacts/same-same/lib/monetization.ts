/**
 * Launch toggle: turn off store billing for a free Play listing (no IAP /
 * merchant profile), while keeping Pro features enabled for everyone.
 *
 * Set `EXPO_PUBLIC_MONETIZATION_ENABLED=true` in eas.json / .env when you are
 * ready to turn RevenueCat + paywalls back on.
 */

export function isMonetizationEnabled(): boolean {
  const raw = process.env.EXPO_PUBLIC_MONETIZATION_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/** Pro features (no watermark, AI suggest, full reveal) without a purchase. */
export function areProFeaturesFree(): boolean {
  return !isMonetizationEnabled();
}

export function isProActive(
  isProFromBilling: boolean,
  proUnlockedFromApp: boolean,
): boolean {
  if (areProFeaturesFree()) return true;
  return isProFromBilling || proUnlockedFromApp;
}

export function shouldShowPaywalls(): boolean {
  return isMonetizationEnabled();
}
