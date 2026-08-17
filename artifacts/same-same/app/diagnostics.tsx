import { router } from "expo-router";
import React, { useEffect } from "react";
import { LaunchDiagnosticsView } from "@/components/LaunchDiagnosticsView";
import { hideSplashSafe, markBootReady, recordBootStep } from "@/utils/bootDiagnostics";

/** Pre-auth screen: shows launch breadcrumbs even if tabs never mount. */
export default function DiagnosticsScreen() {
  useEffect(() => {
    hideSplashSafe();
    recordBootStep("diagnostics-screen");
    markBootReady("diagnostics-route");
  }, []);

  return (
    <LaunchDiagnosticsView
      onContinue={() => router.replace("/")}
      continueLabel="Back to start"
    />
  );
}
