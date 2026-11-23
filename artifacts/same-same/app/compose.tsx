import { Redirect } from "expo-router";
import React from "react";

/**
 * Legacy route — compose now lives on the Ripple tab so Home → camera → Ripple
 * never stacks a second compose over Home.
 */
export default function ComposeRedirect() {
  return <Redirect href="/ripple" />;
}
