import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
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
};

// A flaky / restarting API used to blank EVERY authed image to a bare blue
// spinner forever. We now retry each source a couple of times (re-warming auth
// headers in between, in case a token expired or the API just came back) before
// advancing the source chain, and show a muted skeleton — never an indefinite
// blue — while we wait. Backoff is short so a momentary blip recovers fast.
const MAX_RETRIES_PER_SOURCE = 2;
const RETRY_BACKOFF_MS = [500, 1300];

function normalizeRemotePhotoUri(uri: string): string {
  const trimmed = uri.trim();
  const stream = shouldCanonicalizePhotoStreamUri(trimmed)
    ? canonicalizePhotoStreamUri(trimmed)
    : trimmed;
  return withDisplayPhotoWidth(normalizeUnsplashUri(stream));
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

/** Append a retry nonce so expo-image refetches a failed source (server cache makes this cheap). */
function withRetryNonce(uri: string, attempt: number): string {
  if (attempt <= 0) return uri;
  const sep = uri.includes("?") ? "&" : "?";
  return `${uri}${sep}r=${attempt}`;
}

/** Muted, softly-pulsing placeholder shown while an image loads or retries. */
function PhotoSkeleton() {
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
}: Props) {
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  const normalized = useMemo(() => normalizeRemotePhotoUri(uri), [uri]);
  const normalizedFallback = useMemo(() => {
    const f = fallbackUri?.trim();
    if (!f) return null;
    const n = normalizeRemotePhotoUri(f);
    return n && n !== normalized ? n : null;
  }, [fallbackUri, normalized]);

  // Source chain: primary → (dev hosted retry) → durable fallback →
  // (dev hosted retry) → Unsplash placeholder. Each source also retries
  // in-place a couple of times before the chain advances.
  const [usedFallback, setUsedFallback] = useState(false);
  const [useHosted, setUseHosted] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  };

  useEffect(() => {
    setUsedFallback(false);
    setUseHosted(false);
    setExhausted(false);
    setAttempt(0);
    setLoaded(false);
    clearRetryTimer();
    return clearRetryTimer;
  }, [normalized, normalizedFallback]);

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
    if (cached) {
      setAuthHeaders(cached);
      return;
    }
    warmAuthedImageHeaders();
    let cancelled = false;
    void authedImageHeaders().then((h) => {
      if (!cancelled) setAuthHeaders(h);
    });
    return () => {
      cancelled = true;
    };
  }, [needsAuth, activeUri]);

  const src = exhausted
    ? UNSPLASH_FALLBACK_URI
    : withRetryNonce(activeUri, attempt);
  // Keep the recycle id stable across retry nonces so the view isn't torn
  // down on every retry — only the source bytes are refetched.
  const stableKey =
    recyclingKey ?? (usedFallback ? `fb:${activeUri}` : activeUri);

  const advanceChain = () => {
    // Dev: retry the current source via the hosted origin first.
    if (!useHosted && hostedUri) {
      setUseHosted(true);
      setAttempt(0);
      return;
    }
    // Prefer the durable server image (the user's real photo) over the
    // stock Unsplash placeholder when the local capture is gone.
    if (!usedFallback && normalizedFallback) {
      setUsedFallback(true);
      setUseHosted(false);
      setAttempt(0);
      return;
    }
    setExhausted(true);
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
        // Re-warm auth headers between tries — covers an expired token or an
        // API that was briefly unreachable and has just come back. Use the
        // FORCE refresh (not the cache-respecting `authedImageHeaders()`):
        // expo-image surfaces a 401 the same way as any other load error, so
        // the most likely cause of a failed authed image is a stale/expired
        // Bearer still sitting in the TTL cache. Re-reading the cache would
        // just resend the same dead token; forcing a fresh `getToken()` is
        // what actually unblocks the retry.
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

  // Auth headers always resolve (at minimum X-Device-Id), so this is a brief
  // transient state — render the skeleton, never a blank/blue gap.
  const waitingForAuth = needsAuth && !authHeaders && !exhausted;
  const showSkeleton = waitingForAuth || !loaded;

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
            onLoad={() => {
              clearRetryTimer();
              setLoaded(true);
              // `exhausted` here means we're showing the Unsplash placeholder,
              // i.e. every real source failed.
              onResolvedRef.current?.(!exhausted);
            }}
          onError={handleError}
        />
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
});
