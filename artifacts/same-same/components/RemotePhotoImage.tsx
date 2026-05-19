import React, { useEffect, useState } from "react";
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
}: Props) {
  const [src, setSrc] = useState(() => normalizeUnsplashUri(uri));

  useEffect(() => {
    setSrc(normalizeUnsplashUri(uri));
  }, [uri]);

  return (
    <Image
      source={{ uri: src }}
      style={style}
      contentFit={resizeMode}
      cachePolicy="memory-disk"
      recyclingKey={src}
      transition={transitionMs > 0 ? transitionMs : undefined}
      accessibilityLabel={accessibilityLabel}
      onError={() => {
        setSrc((current) =>
          current === UNSPLASH_FALLBACK_URI ? current : UNSPLASH_FALLBACK_URI,
        );
      }}
    />
  );
}
