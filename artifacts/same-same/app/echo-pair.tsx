import { Redirect, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";

import { Waiting } from "@/components/Waiting";
import { findWaveByPhotos } from "@/core/waves";
import { useAppState } from "@/state/AppState";

/**
 * Opens the Wave named by a push notification.
 * Route file stays `echo-pair` because the live server still deep-links
 * `/echo-pair?a=&b=` — renaming the path would break older pushes.
 */
export default function WavePairScreen() {
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const { waves, syncNow, sync, wavesKnown } = useAppState();

  useEffect(() => {
    void syncNow({ force: true });
  }, [syncNow]);

  const wave = a && b ? findWaveByPhotos(waves, a, b) : null;
  if (wave) return <Redirect href={{ pathname: "/wave/[id]", params: { id: wave.id } }} />;
  if (wavesKnown && sync !== "syncing") return <Redirect href="/" />;
  return <Waiting message="Opening your Wave…" />;
}
