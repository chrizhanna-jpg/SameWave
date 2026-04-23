// Fullscreen photo viewer launched from the Discover feed. Tapping a
// photo on a Discover card pushes here with the photo's clip URL +
// metadata; we play that clip while the viewer is up and pause on
// dismiss. The Discover screen's useFocusEffect re-resumes the
// position-based playback when it regains focus, so the user is never
// stranded in silence after closing the viewer.

import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { getActiveUrl, markUserInteracted, pause, playClip } from "@/utils/audio";

export default function PhotoViewer() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    uri?: string;
    clipUrl?: string;
    vibeLabel?: string;
    country?: string;
    countryFlag?: string;
  }>();

  const uri = typeof params.uri === "string" ? params.uri : undefined;
  const clipUrl = typeof params.clipUrl === "string" ? params.clipUrl : undefined;
  const vibeLabel =
    typeof params.vibeLabel === "string" ? params.vibeLabel : undefined;
  const country =
    typeof params.country === "string" ? params.country : undefined;
  const countryFlag =
    typeof params.countryFlag === "string" ? params.countryFlag : undefined;

  // Tapping a photo IS the user gesture — open the audio gate (no-op if
  // already open) and push the new clip through the singleton player.
  // audio.ts handles the swap: same URL = resume, different URL = stop
  // the prior clip and load this one.
  //
  // Always (re)start the clip on mount — even when getActiveUrl()
  // matches, because Discover's blur cleanup will have called pause()
  // by the time we get here. playClip() with the same URL is cheap: it
  // skips the reload and just flips shouldPlay back to true, so the
  // music resumes from where it left off without a restart-from-zero.
  //
  // The unmount behaviour, on the other hand, IS conditional: if the
  // tapped photo was the already-active clip on Discover, we let it
  // keep playing when the viewer closes (Discover's focus effect will
  // own the lifecycle again). Only when the tapped photo is a DIFFERENT
  // clip do we pause on dismiss so the wrong song doesn't bleed back
  // into the feed.
  useEffect(() => {
    markUserInteracted();
    if (!clipUrl) return;
    const wasAlreadyPlaying = getActiveUrl() === clipUrl;
    void playClip(clipUrl);
    if (wasAlreadyPlaying) return;
    return () => {
      void pause();
    };
  }, [clipUrl]);

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close photo"
        onPress={() => router.back()}
        hitSlop={12}
        style={[
          styles.close,
          {
            top: insets.top + 12,
            backgroundColor: "rgba(0,0,0,0.55)",
          },
        ]}
      >
        <Icon name="x" size={22} color="#ffffff" />
      </Pressable>

      {country || vibeLabel ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          {country ? (
            <View style={styles.row}>
              {countryFlag ? (
                <Text style={styles.flag}>{countryFlag}</Text>
              ) : null}
              <Text style={styles.country} numberOfLines={1}>
                {country}
              </Text>
            </View>
          ) : null}
          {vibeLabel ? (
            <View
              style={[
                styles.vibePill,
                {
                  backgroundColor: colors.green + "cc",
                },
              ]}
            >
              <Icon name="volume2" size={14} color="#ffffff" />
              <Text style={styles.vibeText} numberOfLines={1}>
                {vibeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  close: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flag: { fontSize: 22 },
  country: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  vibePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  vibeText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
