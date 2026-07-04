import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import {
  authedImageHeaders,
  explorePhotoUriNeedsAuth,
  peekAuthedImageHeaders,
  refreshAuthedImageHeaders,
  warmAuthedImageHeaders,
} from "@/utils/api";
import {
  getPublicApiOrigin,
  getStagedProductionApiOrigin,
} from "@/utils/publicEnv";
import {
  canonicalizePhotoStreamUri,
  shouldCanonicalizePhotoStreamUri,
  withDisplayPhotoWidth,
} from "@/utils/photoDisplayUri";
import {
  normalizeUnsplashUri,
  UNSPLASH_FALLBACK_URI,
} from "@/utils/unsplashUri";
import { BLANK_FRAME_THRESHOLD_MS, IMAGE_LOAD_V2 } from "@/constants/imageLoading";
import {
  prioritizeHeroPrefetch,
  recordImageLoadComplete,
  recordImageLoadStart,
  type ImageLoadPriority,
} from "@/utils/imageLoadCache";
import { recordImageTelemetry } from "@/utils/imageLoadTelemetry";

type Props = {
  uri: string;
  /**
   * Durable image to try before the Unsplash placeholder when `uri` fails.
   * Used for the viewer's own photo: a `file://` capture can be purged by the
   * OS while the app is backgrounded, so we fall back to the authed server
   * image (their real photo) instead of flashing a stock Unsplash picture.
   */
  fallbackUri?: string;
  style?: ImageStyle;
  resizeMode?: ImageContentFit;
  accessibilityLabel?: string;
  /** Crossfade when `uri` changes (ms). 0 disables. */
  transitionMs?: number;
  /** Stable expo-image recycle id — use photoKey(uri), not a changing CDN query string. */
  recyclingKey?: string;
  /**
   * Fired once the view settles on a final image: `true` when the requested
   * photo (or its durable fallback) actually rendered, `false` when every
   * source failed and we fell back to the generic stock placeholder. Lets the
   * deck avoid playing a card's vibe over a wrong stock image.
   */
  onResolved?: (loadedRealImage: boolean) => void;
  /** Request width for `/api/photos/:id/image` streams (smaller = less server work). */
  displayWidth?: number;
  /** Fetch priority — hero warms cache on mount. */
  priority?: ImageLoadPriority;
};

const MAX_RETRIES_PER_SOURCE = 2;
const RETRY_BACKOFF_MS = [500, 1300];

function normalizeRemotePhotoUri(uri: string, displayWidth?: number): string {
  const trimmed = uri.trim();
  const stream = shouldCanonicalizePhotoStreamUri(trimmed)
    ? canonicalizePhotoStreamUri(trimmed)
    : trimmed;
  const w = displayWidth && displayWidth > 0 ? displayWidth : undefined;
  return withDisplayPhotoWidth(normalizeUnsplashUri(stream), w ?? undefined);
}

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

function withRetryNonce(uri: string, attempt: number): string {
  if (attempt <= 0) return uri;
  const sep = uri.includes("?") ? "&" : "?";
  return `${uri}${sep}r=${attempt}`;
}

/** Muted, softly-pulsing placeholder shown while an image loads or retries. */
export function PhotoSkeleton() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.75,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.skeleton]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
        <View style={[StyleSheet.absoluteFill, styles.skeletonFill]} />
      </Animated.View>
    </View>
  );
}

/**
 * Remote photo with Unsplash URL normalization, auth headers for
 * `/api/photos/:id/image`, retry-with-backoff, and a graceful fallback chain
 * (primary → durable fallback → Unsplash) so a flaky API never blanks the UI.
 */
export function RemotePhotoImage({
  uri,
  fallbackUri,
  style,
  resizeMode = "cover",
  accessibilityLabel,
  transitionMs = 220,
  recyclingKey,
  onResolved,
  displayWidth,
  priority = "normal",
}: Props) {
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  const normalized = useMemo(
    () => normalizeRemotePhotoUri(uri, displayWidth),
    [uri, displayWidth],
  );
  const normalizedFallback = useMemo(() => {
    const f = fallbackUri?.trim();
    if (!f) return null;
    const n = normalizeRemotePhotoUri(f, displayWidth);
    return n && n !== normalized ? n : null;
  }, [fallbackUri, normalized, displayWidth]);

  const [usedFallback, setUsedFallback] = useState(false);
  const [useHosted, setUseHosted] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [manualRetry, setManualRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadStartedAt = useRef<number | null>(null);
  const blankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  };

  const clearBlankTimer = () => {
    if (blankTimer.current) {
      clearTimeout(blankTimer.current);
      blankTimer.current = null;
    }
  };

  useEffect(() => {
    setUsedFallback(false);
    setUseHosted(false);
    setExhausted(false);
    setAttempt(0);
    setLoaded(false);
    clearRetryTimer();
    clearBlankTimer();
    return () => {
      clearRetryTimer();
      clearBlankTimer();
    };
  }, [normalized, normalizedFallback, manualRetry]);

  useEffect(() => {
    if (!IMAGE_LOAD_V2 || !normalized) return;
    if (priority === "hero") {
      prioritizeHeroPrefetch(normalized);
      if (normalizedFallback) prioritizeHeroPrefetch(normalizedFallback);
    }
  }, [normalized, normalizedFallback, priority]);

  const baseUri =
    usedFallback && normalizedFallback ? normalizedFallback : normalized;
  const needsAuth = !exhausted && explorePhotoUriNeedsAuth(baseUri);

  const hostedOrigin = useMemo(
    () => (__DEV__ ? getStagedProductionApiOrigin() : null),
    [],
  );
  const hostedUri = useMemo(() => {
    if (!hostedOrigin || !needsAuth) return null;
    const local = getPublicApiOrigin();
    if (hostedOrigin.replace(/\/$/, "") === local.replace(/\/$/, "")) return null;
    return rewriteApiOrigin(baseUri, hostedOrigin);
  }, [hostedOrigin, needsAuth, baseUri]);

  const [authHeaders, setAuthHeaders] = useState<
    Record<string, string> | undefined
  >(() => (needsAuth ? peekAuthedImageHeaders() : undefined));

  const activeUri = useHosted && hostedUri ? hostedUri : baseUri;

  useEffect(() => {
    if (!needsAuth) {
      setAuthHeaders(undefined);
      return;
    }
    const cached = peekAuthedImageHeaders();
    if (cached?.Authorization?.startsWith("Bearer ")) {
      setAuthHeaders(cached);
      return;
    }
    warmAuthedImageHeaders();
    let cancelled = false;
    let authAttempt = 0;
    const loadAuth = () => {
      const run =
        authAttempt === 0 ? authedImageHeaders() : refreshAuthedImageHeaders();
      void run.then((h) => {
        if (cancelled) return;
        setAuthHeaders(h);
        if (!h.Authorization?.startsWith("Bearer ") && authAttempt < 6) {
          authAttempt += 1;
          authRetryTimer.current = setTimeout(loadAuth, 350 * authAttempt);
        }
      });
    };
    const authRetryTimer = { current: null as ReturnType<typeof setTimeout> | null };
    loadAuth();
    return () => {
      cancelled = true;
      if (authRetryTimer.current) clearTimeout(authRetryTimer.current);
    };
  }, [needsAuth, activeUri]);

  const src = exhausted
    ? UNSPLASH_FALLBACK_URI
    : withRetryNonce(activeUri, attempt);
  const stableKey =
    recyclingKey ?? (usedFallback ? `fb:${activeUri}` : activeUri);

  const advanceChain = () => {
    if (!useHosted && hostedUri) {
      setUseHosted(true);
      setAttempt(0);
      return;
    }
    if (!usedFallback && normalizedFallback) {
      setUsedFallback(true);
      setUseHosted(false);
      setAttempt(0);
      return;
    }
    setExhausted(true);
    recordImageTelemetry("img_error", stableKey);
  };

  const handleError = () => {
    if (exhausted) return;
    clearRetryTimer();
    const onLocalCapture =
      !usedFallback &&
      !useHosted &&
      (baseUri.startsWith("file:") || baseUri.startsWith("content:"));
    if (onLocalCapture && normalizedFallback) {
      advanceChain();
      return;
    }
    if (attempt < MAX_RETRIES_PER_SOURCE) {
      const delay =
        RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)] ?? 800;
      retryTimer.current = setTimeout(() => {
        if (needsAuth) {
          void refreshAuthedImageHeaders()
            .then((h) => setAuthHeaders(h))
            .catch(() => {});
        }
        setLoaded(false);
        setAttempt((a) => a + 1);
      }, delay);
      return;
    }
    advanceChain();
  };

  const waitingForAuth = needsAuth && !authHeaders && !exhausted;
  const showSkeleton = waitingForAuth || !loaded;

  useEffect(() => {
    if (!showSkeleton || exhausted) {
      clearBlankTimer();
      return;
    }
    clearBlankTimer();
    blankTimer.current = setTimeout(() => {
      recordImageTelemetry("img_blank_frame", stableKey, { priority });
    }, BLANK_FRAME_THRESHOLD_MS);
    return clearBlankTimer;
  }, [showSkeleton, exhausted, stableKey, priority]);

  useEffect(() => {
    if (waitingForAuth || exhausted) return;
    loadStartedAt.current = Date.now();
    recordImageLoadStart(activeUri, priority);
  }, [activeUri, waitingForAuth, exhausted, priority, manualRetry]);

  const handleLoad = () => {
    clearRetryTimer();
    clearBlankTimer();
    setLoaded(true);
    const started = loadStartedAt.current;
    if (started != null) {
      recordImageLoadComplete(activeUri, Date.now() - started);
    }
    onResolvedRef.current?.(!exhausted);
  };

  const handleManualRetry = () => {
    setExhausted(false);
    setUsedFallback(false);
    setUseHosted(false);
    setAttempt(0);
    setLoaded(false);
    setManualRetry((n) => n + 1);
  };

  return (
    <View style={[style as StyleProp<ViewStyle>, styles.container]}>
      {showSkeleton ? <PhotoSkeleton /> : null}
      {!waitingForAuth ? (
        <Image
          source={
            needsAuth && authHeaders && !exhausted
              ? { uri: src, headers: authHeaders }
              : { uri: src }
          }
          style={StyleSheet.absoluteFill}
          contentFit={resizeMode}
          cachePolicy="memory-disk"
          recyclingKey={stableKey}
          transition={transitionMs > 0 ? transitionMs : undefined}
          accessibilityLabel={accessibilityLabel}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : null}
      {exhausted ? (
        <Pressable
          style={styles.retryOverlay}
          onPress={handleManualRetry}
          accessibilityLabel="Retry loading photo"
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Tap to retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#0f1115",
  },
  skeleton: {
    backgroundColor: "#0f1115",
  },
  skeletonFill: {
    backgroundColor: "#1b2027",
  },
  retryOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,17,21,0.55)",
  },
  retryText: {
    color: "#c8d0dc",
    fontSize: 12,
    fontWeight: "600",
  },
});
