import React, { useEffect, useMemo, useState } from "react";
import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
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
 * Remote photo with Unsplash URL normalization and a fallback when the CDN
 * returns blank / errors (common on a few stock ids in Expo Go).
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
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    setFailedUri(null);
  }, [normalized]);
  const useFallback = failedUri === normalized;
  const src = useFallback ? UNSPLASH_FALLBACK_URI : normalized;
  const stableKey = recyclingKey ?? normalized;

  return (
    <Image
      source={{ uri: src }}
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
