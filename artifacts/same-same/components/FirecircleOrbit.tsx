import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { setFirecircleFocusSlot } from "@/utils/firecircleAudio";
import { nameFor } from "@/data/countries";
import {
  isTrustedFirecircleThumbUrl,
  resolveFirecircleThumbUri,
} from "@/utils/firecircleThumbPolicy";
import type { FirecircleTileModel } from "@/utils/firecircleLayout";

const TILE = 56;
const IMG = 52;

function hashHue(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function FirecircleTile(props: {
  slot: FirecircleTileModel;
  mapScale: SharedValue<number>;
  hueOnly?: boolean;
  onPressCountry: (tile: FirecircleTileModel) => void;
}) {
  const slotIndex = props.slot.slotIndex;
  const mapScale = props.mapScale;
  const t = useSharedValue(slotIndex * 0.17);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(slotIndex * 0.17 + 1, {
        duration: 2600 + slotIndex * 90,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [slotIndex, t]);

  const style = useAnimatedStyle(() => {
    const TAU = Math.PI * 2;
    const breath = 1 + 0.038 * Math.sin(t.value * TAU);
    const inv = 1 / Math.max(0.55, mapScale.value);
    const px =
      (2.8 + slotIndex * 0.45) *
      Math.sin(t.value * TAU * 0.33 + slotIndex);
    const py =
      (2.1 + slotIndex * 0.38) *
      Math.cos(t.value * TAU * 0.29 + slotIndex * 1.05);
    return {
      transform: [
        { translateX: px * inv },
        { translateY: py * inv },
        { scale: breath },
      ],
    };
  });

  const rawThumb = props.slot.thumbnailUrl?.trim() ?? "";
  const thumb =
    props.hueOnly
      ? null
      : rawThumb.startsWith("data:") || rawThumb.startsWith("http")
        ? rawThumb
        : rawThumb && isTrustedFirecircleThumbUrl(rawThumb)
          ? resolveFirecircleThumbUri(rawThumb)
          : null;
  const hue = hashHue(props.slot.userId);

  return (
    <Animated.View
      style={[
        styles.tileWrap,
        { left: props.slot.x - TILE / 2, top: props.slot.y - TILE / 2 },
        style,
      ]}
    >
      <Pressable
        style={styles.tileHit}
        accessibilityRole="button"
        accessibilityLabel={`Full screen photo for ${nameFor(props.slot.countryCode) ?? props.slot.countryCode}`}
        onPress={() => props.onPressCountry(props.slot)}
      >
        <View style={styles.glowRing}>
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={[
                styles.image,
                { backgroundColor: `hsla(${hue}, 58%, 42%, 0.92)` },
              ]}
            />
          )}
          {!props.hueOnly ? (
            <LinearGradient
              colors={[
                "rgba(255, 120, 60, 0.38)",
                "rgba(30, 80, 120, 0.22)",
                "rgba(255, 200, 120, 0.28)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.grade}
            />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function FirecircleOrbit(props: {
  tiles: FirecircleTileModel[];
  mapScale: SharedValue<number>;
  /** Wavefire map: solid hue discs per participant, no photo thumbs. */
  hueOnly?: boolean;
  onSelectTile: (tile: FirecircleTileModel) => void;
}) {
  useEffect(() => {
    setFirecircleFocusSlot(0);
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % Math.max(1, props.tiles.length);
      setFirecircleFocusSlot(i);
    }, 4200);
    return () => clearInterval(id);
  }, [props.tiles.length]);

  if (props.tiles.length === 0) return null;
  return (
    <>
      {props.tiles.map((slot) => (
        <FirecircleTile
          key={`${slot.spotlightPhotoId ?? slot.countryCode}-${slot.slotIndex}`}
          slot={slot}
          mapScale={props.mapScale}
          hueOnly={props.hueOnly}
          onPressCountry={props.onSelectTile}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  tileWrap: {
    position: "absolute",
    width: TILE,
    height: TILE,
    zIndex: 6,
  },
  tileHit: {
    flex: 1,
    borderRadius: TILE / 2,
  },
  glowRing: {
    width: TILE,
    height: TILE,
    borderRadius: TILE / 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#ff6b35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 200, 160, 0.45)",
  },
  image: {
    width: IMG,
    height: IMG,
    borderRadius: IMG / 2,
  },
  grade: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TILE / 2,
  },
});
