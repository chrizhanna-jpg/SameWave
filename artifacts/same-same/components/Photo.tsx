import { Image, type ImageSource as ExpoImageSource } from "expo-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import { Txt } from "@/components/Txt";
import { PHOTO_BLUR_IN_MS, blurInRadiusAt } from "@/core/photoBlurIn";
import { useAppState } from "@/state/AppState";
import { colors, motion } from "@/theme";

interface Props {
  /** A file, data or web address. Null when only the server has the photo. */
  uri: string | null;
  /** With no `uri`, the user's own photo is fetched from the server by this id. */
  ownPhotoId?: string;
  /** Static blur. Ignored while `blurIn` is driving the soft→sharp settle. */
  blurRadius?: number;
  /**
   * Wave-style load: start soft (`PHOTO_BLUR_IN_RADIUS`), then sharpen after
   * the image loads — same feel as the Waves / Wave reveal ceremony.
   */
  blurIn?: boolean;
  /** Called when the image cannot be shown (broken local file / server 404). */
  onUnavailable?: () => void;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/**
 * One way to show a photo. It always fills its box. Broken or missing images
 * show a quiet "Unavailable" label instead of a blank white tile.
 */
export function Photo({
  uri,
  ownPhotoId,
  blurRadius,
  blurIn = false,
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
      sharpenArmed.current = false;
      if (sharpenTimer.current) {
        clearTimeout(sharpenTimer.current);
        sharpenTimer.current = null;
      }
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

  const effectiveBlur = blurIn
    ? blurInRadiusAt(blurElapsed)
    : (blurRadius ?? 0);

  const beginSharpen = () => {
    if (!blurIn) return;
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

  return (
    <View style={[styles.box, style as StyleProp<object>]}>
      {source && !failed ? (
        <Image
          source={source}
          style={[
            StyleSheet.absoluteFill,
            // expo-image blurRadius is a no-op on web; CSS filter keeps soft→sharp visible in previews.
            Platform.OS === "web" && effectiveBlur > 0
              ? ({ filter: `blur(${Math.min(effectiveBlur, 24)}px)` } as ImageStyle)
              : null,
          ]}
          contentFit="cover"
          blurRadius={Platform.OS === "web" ? 0 : effectiveBlur}
          // Fade transitions on blurRadius changes look like soft↔sharp flicker.
          transition={blurIn ? 0 : motion.fadeQuick}
          cachePolicy="memory-disk"
          accessibilityLabel={accessibilityLabel}
          onLoad={beginSharpen}
          onError={markFailed}
        />
      ) : (
        <View style={styles.missing} accessibilityLabel="Photo unavailable">
          <Txt variant="quiet" tone="secondary" center>
            Unavailable
          </Txt>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", backgroundColor: colors.surface },
  missing: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
  },
});
