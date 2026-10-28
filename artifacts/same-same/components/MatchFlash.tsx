import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { MomentRings } from "@/components/MomentRings";
import { HERO_DISPLAY_WIDTH } from "@/utils/photoDisplayUri";
import {
  CelebrationSwipeDismissHint,
  CelebrationSwipeHandle,
  celebrationDragScale,
} from "@/components/CelebrationSwipeDismiss";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { startMomentSound } from "@/utils/momentSound";
import { photoCountryDisplay, resolveCaptureCountryCode } from "@/utils/photoCountry";
import { RIPPLE_BURST_MS } from "@/utils/waveReveal";

const RIPPLE_SOUND = require("@/assets/sounds/ripple-drop.wav");

export type MatchFlashAction = "share" | undefined;

interface Props {
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode?: string;
  myCountryFlag?: string;
  myCountryCode?: string;
  myCaptureCountryCode?: string;
  theirCaptureCountryCode?: string;
  themeTitle: string;
  themeEmoji: string;
  myPhotoUri?: string;
  theirPhotoUri?: string;
  myPhotoFallbackUri?: string;
  myPhotoCapturedAt?: string;
  myPhotoSharedAt?: string;
  theirPhotoCapturedAt?: string;
  theirPhotoSharedAt?: string;
  onDone: () => void;
  onOpenFull: (action?: MatchFlashAction) => void;
}

type Phase = "burst" | "pulse" | "static";

/**
 * Ripple splash. Tap plays the ripple burst (sound + rings), then the
 * card settles into an anticipation pulse — waiting for a Wave.
 * Dismiss and Open behave as before: the deck does not advance until
 * the user leaves this card.
 */
export function MatchFlash({
  theirCountry,
  theirCountryFlag,
  theirCountryCode,
  myCountryFlag,
  myCountryCode,
  myCaptureCountryCode,
  theirCaptureCountryCode,
  themeTitle,
  themeEmoji,
  myPhotoUri,
  theirPhotoUri,
  myPhotoFallbackUri,
  onDone,
  onOpenFull,
}: Props) {
  const colors = useColors();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("burst");

  const finish = (mode: "dismiss" | "open" | "share") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (mode !== "dismiss") {
      onOpenFull(mode === "share" ? "share" : undefined);
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
          }).start(() => finishRef.current("dismiss"));
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
    const sound = startMomentSound(RIPPLE_SOUND, { maxMs: RIPPLE_BURST_MS + 200 });
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (alive && reduce) setPhase("static");
      })
      .catch(() => {});
    const backup = setTimeout(() => {
      setPhase((current) => (current === "burst" ? "pulse" : current));
    }, RIPPLE_BURST_MS + 400);
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
      clearTimeout(backup);
      sound.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myCap = resolveCaptureCountryCode(myCaptureCountryCode, myPhotoUri);
  const theirCap = resolveCaptureCountryCode(
    theirCaptureCountryCode,
    theirPhotoUri,
  );
  const myDisplay = photoCountryDisplay(myCap);
  const theirDisplay = photoCountryDisplay(theirCap);
  const theirName = theirDisplay.name || theirCountry;
  const dragScale = celebrationDragScale(dragY);
  const backdropDragOpacity = dragY.interpolate({
    inputRange: [-140, 0, 140],
    outputRange: [0.55, 1, 0.55],
    extrapolate: "clamp",
  });
  const waiting = phase !== "burst";

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.backdrop,
          {
            backgroundColor: colors.teal + "ee",
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
          color="#073B34"
          mode={phase}
          durationMs={RIPPLE_BURST_MS}
          onBurstEnd={() => setPhase((current) => (current === "burst" ? "pulse" : current))}
        />
        <CelebrationSwipeHandle style={styles.topHandle} />
        <Pressable
          onPress={() => finish("dismiss")}
          style={styles.dismissBtn}
          hitSlop={12}
          accessibilityLabel="Dismiss ripple"
        >
          <Icon name="x" size={20} color="rgba(0,16,24,0.7)" />
        </Pressable>

        <Text style={styles.kicker}>{waiting ? "Ripple sent" : "Ripple"}</Text>
        <Text style={styles.headline}>
          {waiting ? "Waiting for a Wave" : "Sent"}
        </Text>

        <View style={styles.thumbsRow}>
          <PhotoThumb
            uri={myPhotoUri}
            fallbackUri={myPhotoFallbackUri}
            flag={myDisplay.flag || myCountryFlag || ""}
            label="Yours"
          />
          <Icon name="ripple" size={22} color="rgba(0,16,24,0.55)" />
          <PhotoThumb
            uri={theirPhotoUri}
            flag={theirDisplay.flag || theirCountryFlag}
            label={theirName}
          />
        </View>

        <Text style={styles.meta}>
          {themeEmoji} {themeTitle}
          {theirCountryCode || myCountryCode ? `  ·  ${theirName}` : ""}
        </Text>
        <Text style={styles.waiting}>
          {waiting
            ? "If they ripple back, it becomes a Wave."
            : "Sending your ripple…"}
        </Text>

        <View style={styles.ctaWrap}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              finish("open");
            }}
            style={styles.openSharePill}
            accessibilityLabel="Open and share this match"
          >
            <Icon name="share" size={18} color="#FFFFFF" />
            <Text style={styles.openShareText}>Open / Share</Text>
            <Icon name="arrow-right" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <CelebrationSwipeDismissHint dragY={dragY} />
      </Animated.View>
    </View>
  );
}

function PhotoThumb({
  uri,
  fallbackUri,
  flag,
  label,
}: {
  uri?: string;
  fallbackUri?: string;
  flag: string;
  label: string;
}) {
  return (
    <View style={styles.thumbWrap}>
      {uri ? (
        <RemotePhotoImage
          uri={uri}
          fallbackUri={fallbackUri}
          style={styles.thumb}
          resizeMode="cover"
          transitionMs={0}
          recyclingKey={`flash:${fallbackUri ?? uri}`}
          displayWidth={HERO_DISPLAY_WIDTH}
          priority="hero"
          viewerOwnPhoto={label === "Yours"}
        />
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
    ...StyleSheet.absoluteFill,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  topHandle: {
    position: "absolute",
    top: 12,
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
    fontWeight: "700",
    letterSpacing: 3,
    color: "rgba(0,16,24,0.55)",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headline: {
    fontSize: 28,
    fontWeight: "900",
    color: "#001018",
    letterSpacing: -0.4,
    marginBottom: 18,
    textAlign: "center",
  },
  thumbsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  thumbWrap: {
    width: 112,
    alignItems: "center",
  },
  thumb: {
    width: 112,
    height: 112,
    borderRadius: 20,
    backgroundColor: "rgba(0,16,24,0.18)",
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbFallbackFlag: {
    fontSize: 40,
  },
  thumbLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#001018",
    maxWidth: 112,
  },
  meta: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0,16,24,0.72)",
    marginBottom: 4,
    textAlign: "center",
  },
  waiting: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(0,16,24,0.62)",
    textAlign: "center",
    marginBottom: 8,
  },
  ctaWrap: {
    width: "100%",
    alignItems: "center",
    marginTop: 10,
  },
  openSharePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minWidth: 240,
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#001018",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  openShareText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
});
