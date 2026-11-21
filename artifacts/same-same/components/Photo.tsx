import { Image, type ImageSource as ExpoImageSource } from "expo-image";
import React, { useEffect, useState } from "react";
import { StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import { useAppState } from "@/state/AppState";
import { colors, motion } from "@/theme";

interface Props {
  /** A file, data or web address. Null when only the server has the photo. */
  uri: string | null;
  /** With no `uri`, the user's own photo is fetched from the server by this id. */
  ownPhotoId?: string;
  blurRadius?: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/**
 * One way to show a photo. It always fills its box, and shows calm empty
 * water instead of a broken-image mark when there is nothing to show.
 */
export function Photo({ uri, ownPhotoId, blurRadius, style, accessibilityLabel }: Props) {
  const { backend } = useAppState();
  const [remote, setRemote] = useState<ExpoImageSource | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [uri, ownPhotoId]);

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

  return (
    <View style={[styles.box, style as StyleProp<object>]}>
      {source && !failed ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={blurRadius}
          transition={motion.fadeQuick}
          cachePolicy="memory-disk"
          accessibilityLabel={accessibilityLabel}
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
  box: { overflow: "hidden", backgroundColor: colors.pondLift },
});
