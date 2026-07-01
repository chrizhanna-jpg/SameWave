// In-app square-viewfinder camera. Replaces the system crop step that
// expo-image-picker used to launch (with allowsEditing + aspect [1,1])
// — the user complained that the crop sheet felt like an unnecessary
// extra step when the upload is always square anyway.
//
// What you see in the viewfinder IS the photo: the live preview is
// constrained to a centred square the size of the screen width, and
// the captured image is cropped server-side to match exactly that
// region (camera sensors return 4:3 portraits, so we drop the top and
// bottom strips before handing the bytes back).
//
// Pinch-to-zoom and a two-tap zoom shortcut (1× / 2×) replace the
// cropping interaction. The user can still flip between front and
// back cameras.

import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  State as GHState,
  type PinchGestureHandlerGestureEvent,
} from "react-native-gesture-handler";
import { router, useLocalSearchParams } from "expo-router";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
} from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { setPendingCapture } from "@/utils/captureBus";
import { detectCountryFromGPS } from "@/utils/gpsCountry";

const SCREEN_WIDTH = Dimensions.get("window").width;
// Pinch sensitivity. expo-camera's zoom prop is 0-1; a single full
// pinch (scale 0 → 4) walks the whole range, which feels natural on
// both iOS and Android.
const PINCH_SCALE_FACTOR = 0.25;

export default function InCameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { from, intent } = useLocalSearchParams<{
    from?: string;
    intent?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [zoom, setZoom] = useState(0); // 0..1
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  // Snapshot of zoom at the start of a pinch so the gesture is
  // additive rather than absolute (otherwise releasing the pinch
  // immediately snaps back to whatever scale the next gesture starts
  // at).
  const pinchStartZoomRef = useRef(0);

  const onPinch = useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
      const next =
        pinchStartZoomRef.current +
        (e.nativeEvent.scale - 1) * PINCH_SCALE_FACTOR;
      const clamped = Math.max(0, Math.min(1, next));
      setZoom(clamped);
    },
    [],
  );

  const onPinchStateChange = useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
      // Capture the current zoom at the moment the pinch becomes
      // active, so subsequent move deltas build on top of it instead
      // of resetting to wherever the last gesture ended.
      if (e.nativeEvent.state === GHState.ACTIVE) {
        pinchStartZoomRef.current = zoom;
      }
    },
    [zoom],
  );

  const setZoomShortcut = (target: number) => {
    Haptics.selectionAsync().catch(() => {});
    setZoom(target);
  };

  const flipCamera = () => {
    Haptics.selectionAsync().catch(() => {});
    setFacing((f) => (f === "back" ? "front" : "back"));
  };

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    const captureCountryPromise = detectCountryFromGPS();
    try {
      const shot = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
        exif: false,
      });
      if (!shot?.uri) {
        setBusy(false);
        return;
      }
      // Sensor returns the full frame (typically 4:3). Crop a centred
      // square so the saved photo matches the square the user framed
      // in the viewfinder.
      const w = shot.width ?? 0;
      const h = shot.height ?? 0;
      const side = Math.min(w, h);
      const originX = Math.max(0, Math.round((w - side) / 2));
      const originY = Math.max(0, Math.round((h - side) / 2));
      const cropped = await ImageManipulator.manipulateAsync(
        shot.uri,
        [
          {
            crop: { originX, originY, width: side, height: side },
          },
        ],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!cropped.base64) {
        setBusy(false);
        Alert.alert("Couldn't save photo", "Please try again.");
        return;
      }
      // Navigate immediately — don't block the post screen on GPS (up to 8s).
      // Country is patched in when the fix resolves; upload falls back to
      // declared home country when still unknown at submit time.
      setPendingCapture({
        uri: cropped.uri,
        base64: cropped.base64,
        mimeType: "image/jpeg",
        captureCountryCode: undefined,
      });
      void captureCountryPromise.then((detected) => {
        if (!detected?.code) return;
        setPendingCapture({
          uri: cropped.uri,
          base64: cropped.base64,
          mimeType: "image/jpeg",
          captureCountryCode: detected.code,
        });
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      if (from === "home" || intent) {
        const q = new URLSearchParams();
        if (from === "home") q.set("from", "home");
        if (intent) q.set("intent", intent);
        const suffix = q.toString();
        router.replace(suffix ? `/camera?${suffix}` : "/camera");
      } else {
        router.back();
      }
    } catch {
      Alert.alert("Couldn't capture photo", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 24 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom;
  // Reserve enough room at the bottom for the controls, and centre
  // the square viewfinder in what's left. Falls back to the screen
  // width when that fits, which it always does on phone-sized devices
  // in portrait.
  const viewfinderSize = SCREEN_WIDTH;

  // Permission flow ─────────────────────────────────────────────────
  if (!permission) {
    return <View style={[styles.container, { backgroundColor: "#000" }]} />;
  }
  if (!permission.granted) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: "#000",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          },
        ]}
      >
        <Icon name="camera" size={48} color={colors.mutedForeground} />
        <Text
          style={{
            color: colors.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 18,
            marginTop: 18,
            textAlign: "center",
          }}
        >
          Camera access needed
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            marginTop: 8,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          SameWave needs your camera so you can take a photo of today.
        </Text>
        <TouchableOpacity
          style={{
            marginTop: 24,
            backgroundColor: colors.primary,
            paddingHorizontal: 28,
            paddingVertical: 12,
            borderRadius: 24,
          }}
          onPress={requestPermission}
        >
          <Text
            style={{
              color: colors.primaryForeground,
              fontFamily: "Inter_700Bold",
              fontSize: 14,
            }}
          >
            Allow camera
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={[styles.container, { paddingTop: topPadding }]}>
        {/* Header — close button only. The square viewfinder makes the
            "what you see is what you get" promise visually obvious; no
            need for an extra label. */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
            hitSlop={12}
          >
            <Icon name="x" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={flipCamera}
            style={styles.headerBtn}
            hitSlop={12}
          >
            <Icon name="repeat" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Square viewfinder — the live preview IS the final photo. */}
        <View
          style={[
            styles.viewfinderWrap,
            { width: viewfinderSize, height: viewfinderSize },
          ]}
        >
          <PinchGestureHandler
            onGestureEvent={onPinch}
            onHandlerStateChange={onPinchStateChange}
          >
            <View style={StyleSheet.absoluteFill}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                zoom={zoom}
                ratio="1:1"
              />
            </View>
          </PinchGestureHandler>
        </View>

        {/* Controls. Zoom shortcut chips above the shutter, mirroring
            the native iOS Camera app's 1×/2× pills. */}
        <View
          style={[
            styles.controls,
            { paddingBottom: bottomPadding + 24 },
          ]}
        >
          <View style={styles.zoomRow}>
            {[
              { label: "1×", value: 0 },
              { label: "2×", value: 0.25 },
              { label: "5×", value: 0.6 },
            ].map((z) => {
              const active = Math.abs(zoom - z.value) < 0.02;
              return (
                <TouchableOpacity
                  key={z.label}
                  onPress={() => setZoomShortcut(z.value)}
                  style={[
                    styles.zoomChip,
                    {
                      backgroundColor: active
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.08)",
                      borderColor: active
                        ? "rgba(255,255,255,0.45)"
                        : "rgba(255,255,255,0.18)",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontFamily: "Inter_700Bold",
                      fontSize: 13,
                    }}
                  >
                    {z.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.shutterRow}>
            <View style={{ width: 56 }} />
            <TouchableOpacity
              onPress={capture}
              disabled={busy}
              style={[
                styles.shutter,
                { opacity: busy ? 0.5 : 1 },
              ]}
            >
              <View style={styles.shutterInner} />
            </TouchableOpacity>
            <View style={{ width: 56 }} />
          </View>

          <Text style={styles.hint}>
            Pinch to zoom · what you see is your photo
          </Text>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinderWrap: {
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: "#111",
    marginTop: 12,
  },
  controls: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 24,
  },
  zoomRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  zoomChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  shutterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  hint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 18,
    textAlign: "center",
  },
});
