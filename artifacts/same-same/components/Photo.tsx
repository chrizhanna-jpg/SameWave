import { Image, type ImageSource as ExpoImageSource } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import { PHOTO_BLUR_IN_MS, PHOTO_BLUR_IN_RADIUS, blurInRadiusAt } from "@/core/photoBlurIn";
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
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/**
 * One way to show a photo. It always fills its box, and shows calm empty
 * water instead of a broken-image mark when there is nothing to show.
 */
export function Photo({
  uri,
  ownPhotoId,
  blurRadius,
  blurIn = false,
  style,
  accessibilityLabel,
}: Props) {
  const { backend } = useAppState();
  const [remote, setRemote] = useState<ExpoImageSource | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [blurElapsed, setBlurElapsed] = useState(blurIn ? -1 : PHOTO_BLUR_IN_MS);
  const sharpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
    if (blurIn) setBlurElapsed(-1);
  }, [uri, ownPhotoId, blurIn]);

  useEffect(() => {
    return () => {
      if (sharpenTimer.current) clearTimeout(sharpenTimer.current);
    };
  }, []);

  useEffect(() => {
    if (uri || !ownPhotoId) {
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
  }, [uri, ownPhotoId, backend, attempt]);

  const source: ExpoImageSource | null = uri ? { uri } : remote;
  const effectiveBlur = blurIn
    ? blurInRadiusAt(blurElapsed)
    : (blurRadius ?? 0);

  const beginSharpen = () => {
    if (!blurIn) return;
    if (sharpenTimer.current) clearTimeout(sharpenTimer.current);
    setBlurElapsed(0);
    sharpenTimer.current = setTimeout(() => {
      setBlurElapsed(PHOTO_BLUR_IN_MS);
      sharpenTimer.current = null;
    }, PHOTO_BLUR_IN_MS);
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
          transition={motion.fadeQuick}
          cachePolicy="memory-disk"
          accessibilityLabel={accessibilityLabel}
          onLoad={beginSharpen}
          onError={() => {
            // The server's photo link is signed for about a minute; ask once more for a new one.
            if (!uri && ownPhotoId && attempt === 0) setAttempt(1);
            else setFailed(true);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden", backgroundColor: colors.surface },
});
