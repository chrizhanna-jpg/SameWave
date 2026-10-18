import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { MomentRings } from "@/components/MomentRings";
import {
  CelebrationSwipeDismissHint,
  CelebrationSwipeHandle,
  celebrationDragScale,
} from "@/components/CelebrationSwipeDismiss";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { startMomentSound, type MomentSoundHandle } from "@/utils/momentSound";
import { photoCountryDisplay } from "@/utils/photoCountry";
import {
  WAVE_REVEAL_HOLD_MS,
  WAVE_REVEAL_MAX_MS,
  WAVE_REVEAL_MS,
  waveRevealLifetimeMs,
} from "@/utils/waveReveal";

const WAVE_SOUND = require("@/assets/sounds/beach-waves.mp3");

export type EchoFlashAction = "share" | undefined;

interface Props {
  myCountryFlag?: string;
  myCountryCode?: string;
  myCaptureCountryCode?: string;
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode?: string;
  theirCaptureCountryCode?: string;
  myPhotoUri: string;
  theirPhotoUri: string;
  themeTitle?: string;
  themeEmoji?: string;
  myPhotoCapturedAt?: string;
  myPhotoSharedAt?: string;
  theirPhotoCapturedAt?: string;
  theirPhotoSharedAt?: string;
  onDone: () => void;
  onOpen: () => void;
}

/**
 * Full-screen Wave reveal. Plays the wave rings and sound to the end,
 * then dismisses so it never blocks the app. Skip works immediately.
 * If motion can't run, the static card is the fallback and leaves sooner.
 * Launch routing and the Open action are unchanged.
 */
export function EchoFlash({
  myCountryFlag,
  myCaptureCountryCode,
  theirCountry,
  theirCountryFlag,
  theirCaptureCountryCode,
  myPhotoUri,
  theirPhotoUri,
  themeTitle,
  themeEmoji = "✨",
  onDone,
  onOpen,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);
  const soundRef = useRef<MomentSoundHandle | null>(null);
  const [staticFallback, setStaticFallback] = useState(false);
  const [myImgErr, setMyImgErr] = useState(false);
  const [theirImgErr, setTheirImgErr] = useState(false);

  const finish = (action: "auto" | "open" = "auto") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    soundRef.current?.stop();
    if (action === "open") {
      onOpen();
      return;
    }
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => onDone());
  };

  const finishRef = useRef(finish);
  finishRef.current = finish;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dy) > 80 || Math.abs(g.vy) > 0.7) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          Animated.timing(dragY, {
            toValue: g.dy > 0 ? 360 : -360,
            duration: 180,
            useNativeDriver: true,
          }).start(() => finishRef.current("auto"));
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            tension: 140,
            friction: 9,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          tension: 140,
          friction: 9,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const sound = startMomentSound(WAVE_SOUND, {
      maxMs: WAVE_REVEAL_MS + WAVE_REVEAL_HOLD_MS,
      volume: 0.7,
    });
    soundRef.current = sound;

    const started = Date.now();
    let dismissed = false;
    let lifeTimer = setTimeout(() => {
      if (!dismissed) finishRef.current("auto");
    }, waveRevealLifetimeMs({ animationPlays: true }));
    const capTimer = setTimeout(() => {
      if (!dismissed) finishRef.current("auto");
    }, WAVE_REVEAL_MAX_MS);

    const useStatic = () => {
      setStaticFallback(true);
      const remaining = Math.max(
        0,
        waveRevealLifetimeMs({ animationPlays: false }) - (Date.now() - started),
      );
      clearTimeout(lifeTimer);
      lifeTimer = setTimeout(() => {
        if (!dismissed) finishRef.current("auto");
      }, remaining);
    };

    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (alive && reduce) useStatic();
      })
      .catch(() => useStatic());

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 120,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      alive = false;
      dismissed = true;
      clearTimeout(lifeTimer);
      clearTimeout(capTimer);
      sound.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myDisplay = photoCountryDisplay(myCaptureCountryCode);
  const theirDisplay = photoCountryDisplay(theirCaptureCountryCode);
  const dragScale = celebrationDragScale(dragY);
  const backdropDragOpacity = dragY.interpolate({
    inputRange: [-140, 0, 140],
    outputRange: [0.55, 1, 0.55],
    extrapolate: "clamp",
  });

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.backdrop,
          {
            backgroundColor: colors.gold + "ee",
            opacity: Animated.multiply(fade, backdropDragOpacity),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.center,
          {
            opacity: fade,
            transform: [
              { scale: Animated.multiply(scale, dragScale) },
              { translateY: dragY },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <MomentRings
          color="#6B4E12"
          mode={staticFallback ? "static" : "burst"}
          durationMs={WAVE_REVEAL_MS}
        />
        <CelebrationSwipeHandle
          style={[styles.topHandle, { top: insets.top + 4 }]}
        />
        <Pressable
          onPress={() => finish("auto")}
          style={[
            styles.dismissBtn,
            { top: insets.top + 12, right: insets.right + 16 },
          ]}
          hitSlop={12}
          accessibilityLabel="Skip wave reveal"
        >
          <Icon name="x" size={20} color="rgba(0,16,24,0.7)" />
        </Pressable>

        <Text style={styles.kicker}>They rippled back</Text>
        <Text style={styles.headline}>Wave</Text>

        <View style={styles.thumbsRow}>
          <PhotoThumb
            uri={myPhotoUri}
            failed={myImgErr}
            onError={() => setMyImgErr(true)}
            flag={myDisplay.flag || myCountryFlag || ""}
            label="Yours"
          />
          <Icon name="wave-glyph" size={28} color="#6B4E12" />
          <PhotoThumb
            uri={theirPhotoUri}
            failed={theirImgErr}
            onError={() => setTheirImgErr(true)}
            flag={theirDisplay.flag || theirCountryFlag}
            label={theirDisplay.name || theirCountry}
          />
        </View>

        {themeTitle ? (
          <Text style={styles.meta}>
            {themeEmoji} {themeTitle}
          </Text>
        ) : null}

        <View style={styles.ctaWrap}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              finish("open");
            }}
            style={[styles.openSharePill, { backgroundColor: colors.gold }]}
            accessibilityLabel="Open your Wave reveal card"
          >
            <Icon name="wave-glyph" size={18} color="#001018" />
            <Text style={[styles.openShareText, { color: "#001018" }]}>
              Open Wave
            </Text>
            <Icon name="arrow-right" size={18} color="#001018" />
          </Pressable>
        </View>
        <CelebrationSwipeDismissHint dragY={dragY} />
      </Animated.View>
    </View>
  );
}

function PhotoThumb({
  uri,
  failed,
  onError,
  flag,
  label,
}: {
  uri: string;
  failed: boolean;
  onError: () => void;
  flag: string;
  label: string;
}) {
  return (
    <View style={styles.thumbWrap}>
      {uri && !failed ? (
        <Image source={{ uri }} style={styles.thumb} onError={onError} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbFallbackFlag}>{flag}</Text>
        </View>
      )}
      <Text style={styles.thumbLabel} numberOfLines={1}>
        {flag} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  topHandle: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  dismissBtn: {
    position: "absolute",
    top: 32,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  kicker: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    color: "rgba(0,16,24,0.62)",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headline: {
    fontSize: 40,
    fontWeight: "900",
    color: "#001018",
    letterSpacing: -0.6,
    marginBottom: 18,
    textAlign: "center",
  },
  thumbsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  thumbWrap: {
    width: 120,
    alignItems: "center",
  },
  thumb: {
    width: 120,
    height: 156,
    borderRadius: 18,
    backgroundColor: "rgba(0,16,24,0.18)",
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbFallbackFlag: {
    fontSize: 44,
  },
  thumbLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#001018",
    maxWidth: 120,
  },
  meta: {
    fontSize: 15,
    fontWeight: "700",
    color: "rgba(0,16,24,0.72)",
    textAlign: "center",
  },
  ctaWrap: {
    width: "100%",
    alignItems: "center",
    marginTop: 16,
  },
  openSharePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minWidth: 220,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(0, 16, 24, 0.2)",
  },
  openShareText: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
