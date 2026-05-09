import { createClient } from "@replit/revenuecat-sdk/client";

/**
 * RevenueCat REST API (v2). Use the project **secret** API key from the
 * RevenueCat dashboard (not the public SDK keys bundled in the mobile app).
 *
 * Optional legacy name: `REVENUECAT_API_SECRET` (same value).
 */
export async function getUncachableRevenueCatClient() {
  const secret =
    process.env.REVENUECAT_SECRET_API_KEY?.trim() ||
    process.env.REVENUECAT_API_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Set REVENUECAT_SECRET_API_KEY to your RevenueCat project secret API key (Dashboard → Project → API keys → Secret).",
    );
  }

  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    headers: { Authorization: `Bearer ${secret}` },
  });
}
