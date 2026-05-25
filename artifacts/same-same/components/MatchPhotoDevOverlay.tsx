import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import {
  isSamplePhoto,
  lookupSamplePhotoByUri,
  shouldShowExpoMatchPhotoDebug,
} from "@/data/samplePhotos";
import { photoKey } from "@/utils/photoKey";

type Props = {
  uri: string;
  /** Candidate id from match deck (`SamplePhoto.id`, `synth-…`, or `live-…`). */
  candidateId?: string | null;
  /** Theme stored on the candidate row. */
  theme?: string | null;
  /** Theme the scorer used for this pick (may differ from `theme`). */
  matchedTheme?: string | null;
  style?: ViewStyle;
};

/**
 * Expo-only overlay: sample id + themes for debugging duplicate stock in Ripple.
 * Stripped from release AABs via `shouldShowExpoMatchPhotoDebug` (`__DEV__` gate).
 */
export function MatchPhotoDevOverlay({
  uri,
  candidateId,
  theme,
  matchedTheme,
  style,
}: Props) {
  if (!shouldShowExpoMatchPhotoDebug(uri, candidateId)) return null;

  const sample = lookupSamplePhotoByUri(uri);
  const id = candidateId ?? sample?.id ?? "—";
  const photoTheme = theme ?? sample?.theme ?? "—";
  const matchTheme = (matchedTheme ?? "").trim();
  const key = photoKey(uri);
  const pool = isSamplePhoto(uri)
    ? "sample"
    : id.startsWith("live-")
      ? "live"
      : id.startsWith("synth-")
        ? "synth"
        : "dev";
  const backendId = id.startsWith("live-") ? id.slice(5) : null;
  const uriHint = uri.replace(/^https?:\/\//, "").slice(0, 56);

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <Text style={styles.line} numberOfLines={1}>
        {pool} · id {id}
        {backendId ? ` · db ${backendId}` : ""}
      </Text>
      <Text style={styles.line} numberOfLines={1}>
        theme {photoTheme}
        {matchTheme && matchTheme !== photoTheme ? ` · match ${matchTheme}` : ""}
      </Text>
      {sample?.launchSlot ? (
        <Text style={styles.line} numberOfLines={1}>
          slot {sample.launchSlot}
        </Text>
      ) : null}
      {key ? (
        <Text style={styles.keyLine} numberOfLines={1}>
          key {key}
        </Text>
      ) : null}
      <Text style={styles.uriLine} numberOfLines={2}>
        {uriHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    zIndex: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    gap: 2,
  },
  line: {
    color: "#7ee8ff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  keyLine: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  uriLine: {
    color: "rgba(255,255,255,0.58)",
    fontFamily: "Inter_400Regular",
    fontSize: 9,
  },
});
