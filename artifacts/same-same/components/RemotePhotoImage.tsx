import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import { authedImageHeaders, explorePhotoUriNeedsAuth } from "@/utils/api";
import {
  getPublicApiOrigin,
  getStagedProductionApiOrigin,
} from "@/utils/publicEnv";
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

function rewriteApiOrigin(uri: string, origin: string): string | null {
  try {
    const u = new URL(uri);
    const o = new URL(origin.includes("://") ? origin : `https://${origin}`);
    if (u.pathname.includes("/api/photos/") && u.pathname.endsWith("/image")) {
      u.protocol = o.protocol;
      u.host = o.host;
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return null;
}

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
  const hostedOrigin = useMemo(
    () => (__DEV__ ? getStagedProductionApiOrigin() : null),
    [],
  );
  const hostedUri = useMemo(() => {
    if (!hostedOrigin || !needsAuth) return null;
    const local = getPublicApiOrigin();
    if (hostedOrigin.replace(/\/$/, "") === local.replace(/\/$/, "")) return null;
    return rewriteApiOrigin(normalized, hostedOrigin);
  }, [hostedOrigin, needsAuth, normalized]);

  const [authHeaders, setAuthHeaders] = useState<
    Record<string, string> | undefined
  >();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [useHosted, setUseHosted] = useState(false);

  useEffect(() => {
    setFailedUri(null);
    setUseHosted(false);
  }, [normalized]);

  const activeUri =
    useHosted && hostedUri ? hostedUri : normalized;
  const useFallback = failedUri === activeUri;

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
  }, [needsAuth, activeUri]);

  const src = useFallback ? UNSPLASH_FALLBACK_URI : activeUri;
  const stableKey = recyclingKey ?? activeUri;

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
        if (!useHosted && hostedUri) {
          setUseHosted(true);
          return;
        }
        setFailedUri(activeUri);
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
