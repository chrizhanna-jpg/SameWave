import React from "react";

import { ComposeRipple } from "@/components/ComposeRipple";

/**
 * Ripple tab: the compose / upload-moment screen.
 * Home's "Capture a moment" opens the camera, then lands here with the photo.
 * Opening this tab with no draft photo shows Add a photo.
 */
export default function RippleScreen() {
  return <ComposeRipple embeddedInTab />;
}
