import { Image, type ImageSource as ExpoImageSource } from "expo-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import { Txt } from "@/components/Txt";
import { PHOTO_BLUR_IN_MS, PHOTO_BLUR_IN_RADIUS, blurInRadiusAt } from "@/core/photoBlurIn";
import { useAppState } from "@/state/AppState";
import { colors } from "@/theme";

interface Props {
  /** A file, data or web address. Null when only the server has the photo. */
  uri: string | null;
  /** With no `uri`, the user's own photo is fetched from the server by this id. */
  ownPhotoId?: string;
  /** Static blur. Ignored while `blurIn` is driving the soft→sharp settle. */
  blurRadius?: number;
  /**
   * Wave-style load: keep the image at opacity 0 until it has loaded *with*
   * soft blur already applied, then reveal instantly (no fade). After a hold,
   * snap sharp with transition 0 — never paint a sharp first frame.
   */
  blurIn?: boolean;
  /**
   * Match / full-bleed: never show the "Unavailable" label. Loading and hard
   * failure both keep a quiet dark placeholder (blurred surface, no copy).
   */
  quiet?: boolean;
  /** Called when the image cannot be shown (broken local file / server 404). */
  onUnavailable?: () => void;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/**
 * One way to show a photo. It always fills its box.
 * Loading a remote `ownPhotoId` is not an error — only a real failure shows
 * the quiet "Unavailable" label (unless `quiet` suppresses it).
 */
export function Photo({
  uri,
  ownPhotoId,
  blurRadius,
  blurIn = false,
  quiet = false,
  onUnavailable,
  style,
  accessibilityLabel,
}: Props) {
  const { backend } = useAppState();
  const [remote, setRemote] = useState<ExpoImageSource | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [useRemoteFallback, setUseRemoteFallback] = useState(false);
  const [blurElapsed, setBlurElapsed] = useState(blurIn ? -1 : PHOTO_BLUR_IN_MS);
  /** Hold opacity at 0 until onLoad fires with soft blur already set. */
  const [revealed, setRevealed] = useState(!blurIn);
  const sharpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Prevents onLoad → blurRadius change → onLoad loops that flicker soft↔sharp. */
  const sharpenArmed = useRef(false);
  const unavailableNotified = useRef(false);

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
    setUseRemoteFallback(false);
    unavailableNotified.current = false;
    if (blurIn) {
      setBlurElapsed(-1);
      setRevealed(false);
      sharpenArmed.current = false;
      if (sharpenTimer.current) {
        clearTimeout(sharpenTimer.current);
        sharpenTimer.current = null;
      }
    } else {
      setRevealed(true);
    }
  }, [uri, ownPhotoId, blurIn]);

  useEffect(() => {
    return () => {
      if (sharpenTimer.current) clearTimeout(sharpenTimer.current);
    };
  }, []);

  useEffect(() => {
    const wantRemote = Boolean(ownPhotoId) && (!uri || useRemoteFallback);
    if (!wantRemote || !ownPhotoId) {
      setRemote(null);
      return;
    }
    let cancelled = false;
    backend
      .photoSource(ownPhotoId)
      .then((source) => {
        if (!cancelled) setRemote({ uri: source.uri, headers: source.headers });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uri, ownPhotoId, backend, attempt, useRemoteFallback]);

  useEffect(() => {
    if (!failed || unavailableNotified.current) return;
    unavailableNotified.current = true;
    onUnavailable?.();
  }, [failed, onUnavailable]);

  const source: ExpoImageSource | null = useMemo(() => {
    if (uri && !useRemoteFallback) return { uri };
    return remote;
  }, [uri, useRemoteFallback, remote]);

  // Soft from the first painted frame when blurIn; static blurRadius otherwise.
  const effectiveBlur = blurIn
    ? blurInRadiusAt(blurElapsed)
    : (blurRadius ?? 0);

  const beginSharpen = () => {
    if (!blurIn) return;
    // Reveal only once the soft frame is ready — never show sharp first.
    setRevealed(true);
    // expo-image often re-fires onLoad when blurRadius changes; arm once per source.
    if (sharpenArmed.current) return;
    sharpenArmed.current = true;
    if (sharpenTimer.current) clearTimeout(sharpenTimer.current);
    setBlurElapsed(0);
    sharpenTimer.current = setTimeout(() => {
      setBlurElapsed(PHOTO_BLUR_IN_MS);
      sharpenTimer.current = null;
    }, PHOTO_BLUR_IN_MS);
  };

  const markFailed = () => {
    // Local file gone → try the server once when we have an id.
    if (uri && !useRemoteFallback && ownPhotoId) {
      setUseRemoteFallback(true);
      setAttempt(0);
      setFailed(false);
      return;
    }
    // Server signed URL can expire; ask once more for a fresh link.
    if ((!uri || useRemoteFallback) && ownPhotoId && attempt === 0) {
      setAttempt(1);
      return;
    }
    setFailed(true);
  };

  // Waiting on remote fetch is not a failure — never flash "Unavailable".
  const waitingForRemote = Boolean(ownPhotoId) && !source && !failed;
  const showImage = Boolean(source) && !failed;
  const showLabel = failed && !quiet && !waitingForRemote;

  return (
    <View style={[styles.box, quiet && styles.boxQuiet, style as StyleProp<object>]}>
      {showImage ? (
        <Image
          source={source}
          style={[
            StyleSheet.absoluteFill,
            // Hold invisible until soft blur is on the loaded bitmap.
            { opacity: blurIn && !revealed ? 0 : 1 },
            // expo-image blurRadius is a no-op on web; CSS filter keeps soft→sharp visible in previews.
            Platform.OS === "web" && effectiveBlur > 0
              ? ({ filter: `blur(${Math.min(effectiveBlur, 24)}px)` } as ImageStyle)
              : null,
          ]}
          contentFit="cover"
          blurRadius={
            Platform.OS === "web"
              ? 0
              : // Apply soft radius before first paint when blurIn (elapsed -1 → radius).
                Math.max(effectiveBlur, blurIn && !revealed ? PHOTO_BLUR_IN_RADIUS : 0)
          }
          // No fade on reveal or on soft→sharp — Chris wants snap, not soft↔sharp flicker.
          transition={0}
          cachePolicy="memory-disk"
          accessibilityLabel={accessibilityLabel}
          onLoad={beginSharpen}
          onError={markFailed}
        />
      ) : showLabel ? (
        <View style={styles.missing} accessibilityLabel="Photo unavailable">
          <Txt variant="quiet" tone="secondary" center>
            Unavailable
          </Txt>
        </View>
      ) : (
        // Loading remote, or quiet failure — dark placeholder only.
        <View
          style={styles.placeholder}
          accessibilityLabel={failed ? "Photo unavailable" : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", backgroundColor: colors.surface },
  boxQuiet: { backgroundColor: "#000000" },
  missing: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000",
  },
});
