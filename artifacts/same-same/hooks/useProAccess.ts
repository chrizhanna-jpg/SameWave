import { useApp } from "@/context/AppContext";
import {
  isMonetizationEnabled,
  isProActive,
  shouldShowPaywalls,
} from "@/lib/monetization";
import { areProFeaturesLaunched } from "@/lib/proFeatures";
import { useSubscription } from "@/lib/revenuecat";

/** Pro entitlement + whether purchase UI should appear. */
export function useProAccess(): {
  proActive: boolean;
  monetizationEnabled: boolean;
  showPaywalls: boolean;
  proFeaturesLaunched: boolean;
} {
  const { proUnlocked } = useApp();
  const { isPro } = useSubscription();
  const monetizationEnabled = isMonetizationEnabled();
  return {
    monetizationEnabled,
    showPaywalls: shouldShowPaywalls(),
    proActive: isProActive(isPro, proUnlocked),
    proFeaturesLaunched: areProFeaturesLaunched(),
  };
}
