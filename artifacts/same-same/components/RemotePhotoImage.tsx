import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import { authedImageHeaders, explorePhotoUriNeedsAuth } from "@/utils/api";
import {
  normalizeUnsplashUri,
  UNSPLASH_FALLBACK_URI,
} from "@/utils/unsplashUri";

type Props = {
  uri: string;
  style?: ImageStyle;
  resizeMode?: ImageContentFit;
  accessibilityLabel?: string;
  /** Crossfade when `uri` changes (ms). 0 disables. */
  transitionMs?: number;
  /** Stable expo-image recycle id — use photoKey(uri), not a changing CDN query string. */
  recyclingKey?: string;
};

/**
 * Remote photo with Unsplash URL normalization, auth headers for
 * `/api/photos/:id/image`, and a fallback when the CDN errors.
 */
export function RemotePhotoImage({
  uri,
  style,
  resizeMode = "cover",
  accessibilityLabel,
  transitionMs = 220,
  recyclingKey,
}: Props) {
  const normalized = useMemo(() => normalizeUnsplashUri(uri), [uri]);
  const needsAuth = explorePhotoUriNeedsAuth(normalized);
  const [authHeaders, setAuthHeaders] = useState<
    Record<string, string> | undefined
  >();
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    setFailedUri(null);
  }, [normalized]);

  useEffect(() => {
    if (!needsAuth) {
      setAuthHeaders(undefined);
      return;
    }
    let cancelled = false;
    void authedImageHeaders().then((h) => {
      if (!cancelled) setAuthHeaders(h);
    });
    return () => {
      cancelled = true;
    };
  }, [needsAuth, normalized]);

  const useFallback = failedUri === normalized;
  const src = useFallback ? UNSPLASH_FALLBACK_URI : normalized;
  const stableKey = recyclingKey ?? normalized;

  if (needsAuth && !authHeaders && !useFallback) {
    return (
      <View style={[style, styles.loader]}>
        <ActivityIndicator color="#9ec5d8" />
      </View>
    );
  }

  return (
    <Image
      source={
        needsAuth && authHeaders && !useFallback
          ? { uri: src, headers: authHeaders }
          : { uri: src }
      }
      style={style}
      contentFit={resizeMode}
      cachePolicy="memory-disk"
      recyclingKey={stableKey}
      transition={transitionMs > 0 ? transitionMs : undefined}
      accessibilityLabel={accessibilityLabel}
      onError={() => {
        setFailedUri(normalized);
      }}
    />
  );
}

const styles = StyleSheet.create({
  loader: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
});
