import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { wavePhotoSlot } from "@/core/wavePhotoSlot";
import { chooseFromLibrary, cropToWaveSlot } from "@/device/photos";
import { setDraftPhoto, setDraftTopic } from "@/state/draft";
import { colors, layout, radius, space } from "@/theme";

/** Some phones never report that the camera is ready; after this long it is treated as ready. */
const READY_FALLBACK_MS = 1200;
const MAX_RESTARTS = 2;
/** expo-camera zoom is 0–1 of device max; 2× is treated as halfway. */
const ZOOM_1X = 0;
const ZOOM_2X = 0.5;

function pinchDistance(event: GestureResponderEvent): number | null {
  const touches = event.nativeEvent.touches;
  if (!touches || touches.length < 2) return null;
  const a = touches[0]!;
  const b = touches[1]!;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);

  const [facing, setFacing] = useState<CameraType>("back");
  // The camera is only held while this screen is in front.
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [restarts, setRestarts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [room, setRoom] = useState<number | null>(null);
  const [zoom, setZoom] = useState(ZOOM_1X);
  const pinch = useRef<{ startDist: number; startZoom: number } | null>(null);

  const slot = wavePhotoSlot(width, height);

  useFocusEffect(
    useCallback(() => {
      setLive(true);
      setRestarts(0);
      setProblem(null);
      setZoom(ZOOM_1X);
      return () => {
        setLive(false);
        setReady(false);
      };
    }, []),
  );

  useEffect(() => {
    if (!live || !permission?.granted) return;
    setReady(false);
    const timer = setTimeout(() => setReady(true), READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [live, permission?.granted, facing, restarts]);

  const useLibrary = async () => {
    try {
      const photo = await chooseFromLibrary();
      if (!photo) return;
      setDraftPhoto(photo);
      router.replace("/compose");
    } catch {
      setProblem("That photo couldn't be opened. Try another.");
    }
  };

  const takePhoto = async () => {
    if (!camera.current || busy || !ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const shot = await camera.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
        exif: false,
      });
      if (!shot?.uri) throw new Error("No photo was returned");
      const cropped = await cropToWaveSlot(shot.uri, slot.aspectRatio).catch(() => shot.uri);
      setDraftPhoto({
        uri: cropped,
        takenAt: new Date().toISOString(),
        coords: null,
        source: "camera",
      });
      router.replace("/compose");
    } catch {
      setProblem("The photo didn't take. Try once more.");
      setBusy(false);
    }
  };

  const onPinchStart = (event: GestureResponderEvent) => {
    const dist = pinchDistance(event);
    if (dist == null || dist < 8) {
      pinch.current = null;
      return;
    }
    pinch.current = { startDist: dist, startZoom: zoom };
  };

  const onPinchMove = (event: GestureResponderEvent) => {
    const dist = pinchDistance(event);
    if (dist == null || !pinch.current || pinch.current.startDist < 8) return;
    const scale = dist / pinch.current.startDist;
    const next = Math.min(1, Math.max(0, pinch.current.startZoom + (scale - 1) * 0.85));
    setZoom(next);
  };

  const onPinchEnd = () => {
    pinch.current = null;
  };

  const flipCamera = () => {
    setZoom(ZOOM_1X);
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  if (!permission) {
    return <Screen>{null}</Screen>;
  }

  const abandon = () => {
    setDraftTopic(null);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (!permission.granted) {
    return (
      <Screen style={styles.ask}>
        <Header icon="close" onPress={abandon} />
        <View style={styles.askCentre}>
          <Txt variant="title" center>
            Take today&apos;s photo
          </Txt>
          <Txt tone="secondary" center style={styles.line}>
            SameWave needs your camera to take it.
          </Txt>
          <Button
            label="Allow camera"
            onPress={() =>
              permission.canAskAgain ? void requestPermission() : void Linking.openSettings()
            }
            style={styles.allow}
          />
          <Button
            kind="quiet"
            label="Choose from your photos instead"
            onPress={useLibrary}
            style={styles.line}
          />
        </View>
      </Screen>
    );
  }

  // Match the Wave photo slot (half screen + half seam band), so framing matches the match screen.
  const maxHeight = room ?? height * 0.55;
  let frameWidth = Math.min(width - space.lg * 2, Math.round(maxHeight * slot.aspectRatio));
  let frameHeight = Math.round(frameWidth / slot.aspectRatio);
  if (frameHeight > maxHeight) {
    frameHeight = Math.round(maxHeight);
    frameWidth = Math.round(frameHeight * slot.aspectRatio);
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Header icon="close" onPress={abandon} />
      </View>

      <View style={styles.middle} onLayout={(event) => setRoom(event.nativeEvent.layout.height)}>
        <View
          style={[styles.frame, { width: frameWidth, height: frameHeight }]}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onPinchStart}
          onResponderMove={onPinchMove}
          onResponderRelease={onPinchEnd}
          onResponderTerminate={onPinchEnd}
        >
          {live ? (
            <CameraView
              key={`${facing}-${restarts}`}
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing={facing}
              zoom={zoom}
              onCameraReady={() => setReady(true)}
              onMountError={() => {
                if (restarts < MAX_RESTARTS) setRestarts((n) => n + 1);
                else setProblem("The camera wouldn't start. You can choose a photo instead.");
              }}
            />
          ) : null}
          {/* Soft guide: bottom of this frame sits under the wave seam on the match screen. */}
          <View pointerEvents="none" style={[styles.seamGuide, { height: Math.max(12, slot.seamBand / 2) }]} />
          <View style={styles.zoomChips} pointerEvents="box-none">
            {(
              [
                { label: "1×", value: ZOOM_1X },
                { label: "2×", value: ZOOM_2X },
              ] as const
            ).map((chip) => {
              const active = Math.abs(zoom - chip.value) < 0.08;
              return (
                <Pressable
                  key={chip.label}
                  onPress={() => setZoom(chip.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Zoom ${chip.label}`}
                  style={[styles.chip, active && styles.chipOn]}
                >
                  <Txt variant="quiet" tone={active ? "primary" : "secondary"}>
                    {chip.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
        {problem ? (
          <Txt variant="quiet" tone="ember" center style={styles.problem}>
            {problem}
          </Txt>
        ) : null}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.lg }]}>
        <Pressable
          onPress={useLibrary}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Choose from your photos"
          style={styles.side}
        >
          <Icon name="photos" size={28} />
        </Pressable>
        <Pressable
          onPress={takePhoto}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          style={({ pressed }) => [
            styles.shutter,
            (!ready || busy) && styles.shutterWaiting,
            pressed && styles.shutterPressed,
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <Pressable
          onPress={flipCamera}
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Switch camera"
          style={styles.side}
        >
          <Icon name="flip" size={28} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1A2425" },
  header: { paddingHorizontal: space.lg },
  middle: { flex: 1, justifyContent: "center", alignItems: "center" },
  frame: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  seamGuide: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(233, 246, 255, 0.22)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(233, 246, 255, 0.55)",
  },
  zoomChips: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: space.md,
    flexDirection: "row",
    justifyContent: "center",
    gap: space.sm,
  },
  chip: {
    minWidth: layout.iconButtonSize,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTranslucent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.waterPale,
    borderColor: colors.waterMid,
  },
  problem: { position: "absolute", bottom: space.md, left: space.lg, right: space.lg },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: space.md,
  },
  side: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.white },
  shutterWaiting: { opacity: 0.4 },
  shutterPressed: { transform: [{ scale: 0.94 }] },
  ask: { justifyContent: "flex-start" },
  askCentre: { flex: 1, justifyContent: "center" },
  line: { marginTop: space.md },
  allow: { marginTop: space.xl },
});
