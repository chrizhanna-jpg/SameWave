// SameWave billing — wraps RevenueCat's react-native-purchases SDK in a
// thin context so screens can read entitlements / pull pricing / trigger
// purchases without ever touching the SDK directly.
//
// Why a context (not just direct SDK calls):
//   • The customer-info object changes after every purchase / restore /
//     app-foreground; React components need it as state to re-render.
//   • Pricing is read from the live offering — never hardcoded — so the
//     paywall always shows the user's local currency / store price.
//   • In dev (Expo Go) the SDK runs in Preview API Mode (mocked native
//     calls) — same hooks, same shapes, no platform branching needed
//     in callers.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";

const REVENUECAT_TEST_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// Single source of truth for the entitlement we check against. Matches
// the lookup_key seeded in RevenueCat (scripts/src/seedRevenueCat.ts).
export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

// Pick the right public API key for the surface we're running on:
//   • Expo Go ("storeClient") and the web preview don't have native
//     store SDKs available, so we fall back to the Test Store key —
//     this is what lets the paywall actually show £1.00 in development.
//   • A native production iOS build uses the Apple App Store key.
//   • A native production Android build uses the Play Store key.
//   • __DEV__ also forces Test Store so internal dev builds against the
//     debug bundle never accidentally hit the live store.
function getRevenueCatApiKey(): string | undefined {
  if (
    __DEV__ ||
    Platform.OS === "web" ||
    Constants.executionEnvironment === "storeClient"
  ) {
    return REVENUECAT_TEST_API_KEY;
  }
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

// Module-scoped flag so initializeRevenueCat is safe to call more than
// once (Fast Refresh in dev re-runs the root layout's useEffect).
let configured = false;

export function initializeRevenueCat(): void {
  if (configured) return;
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    throw new Error(
      "RevenueCat public API key missing — check EXPO_PUBLIC_REVENUECAT_*_API_KEY env vars",
    );
  }
  Purchases.setLogLevel(
    __DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN,
  );
  Purchases.configure({ apiKey });
  configured = true;
}

type SubscriptionContextValue = {
  // True iff RevenueCat reports the "pro" entitlement is currently active
  // for this user. This is the single boolean the rest of the app reads
  // off of when deciding whether to show watermarks / upsell buttons.
  isPro: boolean;
  // True once we have an actual CustomerInfo object back from the SDK
  // (whether or not the user owns Pro). Distinct from `!isLoading`,
  // which also flips to false on bootstrap *failure* (offline, store
  // unreachable). Code that mirrors `isPro` into other state MUST gate
  // on this — otherwise a paid user with a flaky network gets their
  // local proUnlocked flag wiped to false on cold start and the
  // watermark comes back even though they own Pro.
  hasResolvedEntitlements: boolean;
  // The current offering's first available package — i.e. the one the
  // £1 paywall CTA should buy. Null while loading or if RevenueCat has
  // no offering configured.
  proPackage: PurchasesPackage | null;
  // Localised price string from the store ("£1.00", "$1.29", etc.).
  // Null while loading; callers should fall back gracefully.
  priceString: string | null;
  // True while the SDK is still resolving the initial offering /
  // customer info — paywall CTAs should disable themselves until then.
  isLoading: boolean;
  // True while a purchase or restore round-trip is in flight.
  isPurchasing: boolean;
  isRestoring: boolean;
  // Throws on failure (caller renders the error). Resolves with the
  // updated CustomerInfo on success so the caller can immediately
  // check `entitlements.active.pro`.
  purchase: () => Promise<CustomerInfo>;
  restore: () => Promise<CustomerInfo>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null,
);

export function SubscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Bootstrap: pull the current offering and customer info on mount,
  // then subscribe to live customer-info updates so the paywall closes
  // automatically the moment the entitlement flips active (e.g. after
  // a successful purchase, a restore, or a webhook-pushed change).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [offerings, info] = await Promise.all([
          Purchases.getOfferings(),
          Purchases.getCustomerInfo(),
        ]);
        if (cancelled) return;
        setOffering(offerings.current ?? null);
        setCustomerInfo(info);
      } catch (err) {
        // Don't crash the app over a billing fetch — the paywall will
        // simply show its loading state and the user can try later.
        console.warn("[revenuecat] bootstrap failed", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    const listener = (info: CustomerInfo) => {
      if (!cancelled) setCustomerInfo(info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const proPackage = offering?.availablePackages?.[0] ?? null;
  const priceString = proPackage?.product?.priceString ?? null;
  // `customerInfo` starts as null and stays that way if the SDK
  // bootstrap fails — never trust the absence of an active entitlement
  // until we've actually received a CustomerInfo object.
  const hasResolvedEntitlements = customerInfo != null;
  const isPro =
    customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !=
    null;

  const purchase = useCallback(async () => {
    if (!proPackage) {
      throw new Error(
        "Pro package isn't available yet — try again in a moment.",
      );
    }
    setIsPurchasing(true);
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(
        proPackage,
      );
      setCustomerInfo(info);
      return info;
    } finally {
      setIsPurchasing(false);
    }
  }, [proPackage]);

  const restore = useCallback(async () => {
    setIsRestoring(true);
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return info;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      isPro,
      hasResolvedEntitlements,
      proPackage,
      priceString,
      isLoading,
      isPurchasing,
      isRestoring,
      purchase,
      restore,
    }),
    [
      isPro,
      hasResolvedEntitlements,
      proPackage,
      priceString,
      isLoading,
      isPurchasing,
      isRestoring,
      purchase,
      restore,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error(
      "useSubscription must be used within a SubscriptionProvider",
    );
  }
  return ctx;
}
