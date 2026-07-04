// In-app square-viewfinder camera. The live preview fills a centred square;
// we crop to square on capture (sensors are typically 4:3). Do NOT set
// ratio="1:1" on CameraView — on Android it uses FILL_CENTER and often
// yields a black surface. Use 4:3 (FIT_CENTER) inside the square clip.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import {
  acquireCameraSession,
  releaseCameraSession,
} from "@/utils/cameraSession";
import { recordCameraEvent } from "@/utils/cameraTelemetry";

const CAMERA_OWNER_ID = "in-camera";
const SCREEN_WIDTH = Dimensions.get("window").width;
const PINCH_SCALE_FACTOR = 0.25;
const MAX_MOUNT_RETRIES = 2;
const PREVIEW_READY_TIMEOUT_MS = 1200;
// 4:3 preview fits inside the square clip on Android without black FIT issues.
const PREVIEW_RATIO = Platform.OS === "android" ? ("4:3" as const) : undefined;

export default function InCameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { from, intent } = useLocalSearchParams<{
    from?: string;
    intent?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [zoom, setZoom] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [remountNonce, setRemountNonce] = useState(0);
  const mountRetries = useRef(0);
  const cameraRef = useRef<CameraView | null>(null);
  const pinchStartZoomRef = useRef(0);
  const previewReadyRef = useRef(false);

  useEffect(() => {
    if (permission === null) {
      recordCameraEvent("camera.permission.pending");
    }
  }, [permission]);

  useFocusEffect(
    useCallback(() => {
      if (!acquireCameraSession(CAMERA_OWNER_ID)) {
        recordCameraEvent("camera.open.failure", { reason: "camera_busy" });
        setMountError("Camera is in use. Close other camera screens and retry.");
        setCameraLive(false);
        return () => {};
      }
      setMountError(null);
      setPreviewReady(false);
      previewReadyRef.current = false;
      mountRetries.current = 0;
      setCameraLive(true);
      recordCameraEvent("camera.open.start");
      return () => {
        setCameraLive(false);
        setPreviewReady(false);
        previewReadyRef.current = false;
        releaseCameraSession(CAMERA_OWNER_ID);
        recordCameraEvent("camera.release");
      };
    }, []),
  );

  useEffect(() => {
    if (!cameraLive) return;
    setPreviewReady(false);
    previewReadyRef.current = false;
    const timer = setTimeout(() => {
      if (!previewReadyRef.current) {
        recordCameraEvent("camera.open.success", {
          facing,
          source: "timeout_fallback",
        });
        previewReadyRef.current = true;
        setPreviewReady(true);
      }
    }, PREVIEW_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cameraLive, facing, remountNonce]);

  const markPreviewReady = useCallback(
    (source: "onCameraReady" | "timeout_fallback") => {
      if (previewReadyRef.current) return;
      previewReadyRef.current = true;
      setPreviewReady(true);
      recordCameraEvent("camera.open.success", { facing, source });
    },
    [facing],
  );

  const remountCamera = useCallback(() => {
    if (!acquireCameraSession(CAMERA_OWNER_ID)) {
      setMountError("Camera is in use. Close other camera screens and retry.");
      return;
    }
    setPreviewReady(false);
    previewReadyRef.current = false;
    setMountError(null);
    mountRetries.current = 0;
    setRemountNonce((n) => n + 1);
    recordCameraEvent("camera.retry");
  }, []);

  const onPinch = useCallback((e: PinchGestureHandlerGestureEvent) => {
    const next =
      pinchStartZoomRef.current +
      (e.nativeEvent.scale - 1) * PINCH_SCALE_FACTOR;
    setZoom(Math.max(0, Math.min(1, next)));
  }, []);

  const onPinchStateChange = useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
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
    setPreviewReady(false);
    previewReadyRef.current = false;
    setFacing((f) => (f === "back" ? "front" : "back"));
  };

  const capture = async () => {
    if (!cameraRef.current || busy || !previewReady) return;
    setBusy(true);
    recordCameraEvent("camera.capture.start");
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
      const w = shot.width ?? 0;
      const h = shot.height ?? 0;
      const side = Math.min(w, h);
      const originX = Math.max(0, Math.round((w - side) / 2));
      const originY = Math.max(0, Math.round((h - side) / 2));
      const cropped = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ crop: { originX, originY, width: side, height: side } }],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      if (!cropped.base64) {
        Alert.alert("Couldn't save photo", "Please try again.");
        recordCameraEvent("camera.capture.failure", { reason: "empty_base64" });
        return;
      }
      const detected = await captureCountryPromise;
      setPendingCapture({
        uri: cropped.uri,
        base64: cropped.base64,
        mimeType: "image/jpeg",
        captureCountryCode: detected?.code,
      });
      recordCameraEvent("camera.capture.success");
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
    } catch (err) {
      recordCameraEvent("camera.capture.failure", {
        reason: err instanceof Error ? err.message : "unknown",
      });
      Alert.alert("Couldn't capture photo", "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 24 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom;
  const viewfinderSize = SCREEN_WIDTH;

  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fff" size="large" />
        <Text style={styles.permissionHint}>Checking camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, { paddingHorizontal: 32 }]}>
        <Icon name="camera" size={48} color={colors.mutedForeground} />
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>
          Camera access needed
        </Text>
        <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
          SameWave needs your camera so you can take a photo of today.
        </Text>
        <TouchableOpacity
          style={[styles.allowBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void requestPermission().then((res) => {
              recordCameraEvent(
                res.granted ? "camera.permission.granted" : "camera.permission.denied",
              );
            });
          }}
        >
          <Text style={[styles.allowBtnText, { color: colors.primaryForeground }]}>
            Allow camera
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={[styles.container, { paddingTop: topPadding }]}>
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

        <View
          style={[
            styles.viewfinderWrap,
            { width: viewfinderSize, height: viewfinderSize },
          ]}
          onLayout={() => {
            recordCameraEvent("camera.surface.ready", {
              w: viewfinderSize,
              h: viewfinderSize,
            });
          }}
        >
          {cameraLive && !mountError ? (
            <PinchGestureHandler
              onGestureEvent={onPinch}
              onHandlerStateChange={onPinchStateChange}
            >
              <View style={StyleSheet.absoluteFill}>
                <CameraView
                  key={`cam-${facing}-${remountNonce}`}
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  zoom={zoom}
                  ratio={PREVIEW_RATIO}
                  onCameraReady={() => markPreviewReady("onCameraReady")}
                  onMountError={(e) => {
                    const msg = e.message?.trim() || "Camera failed to start";
                    recordCameraEvent("camera.open.failure", { message: msg });
                    if (mountRetries.current < MAX_MOUNT_RETRIES) {
                      mountRetries.current += 1;
                      setRemountNonce((n) => n + 1);
                      return;
                    }
                    setMountError(msg);
                    setPreviewReady(false);
                    previewReadyRef.current = false;
                  }}
                />
              </View>
            </PinchGestureHandler>
          ) : null}

          {!previewReady && !mountError ? (
            <View style={styles.previewPlaceholder} pointerEvents="none">
              <ActivityIndicator color="#fff" size="large" />
              <Text style={styles.previewPlaceholderText}>Starting camera…</Text>
            </View>
          ) : null}

          {mountError ? (
            <View style={styles.previewPlaceholder}>
              <Icon name="camera" size={36} color="rgba(255,255,255,0.7)" />
              <Text style={styles.errorText}>{mountError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={remountCamera}>
                <Text style={styles.retryBtnText}>Retry camera</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={[styles.controls, { paddingBottom: bottomPadding + 24 }]}>
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
                  <Text style={styles.zoomChipText}>{z.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.shutterRow}>
            <View style={{ width: 56 }} />
            <TouchableOpacity
              onPress={capture}
              disabled={busy || !previewReady}
              style={[styles.shutter, { opacity: busy || !previewReady ? 0.45 : 1 }]}
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
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  permissionHint: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  permissionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginTop: 18,
    textAlign: "center",
  },
  permissionBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  allowBtn: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  allowBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
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
  previewPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,17,0.72)",
    paddingHorizontal: 24,
    gap: 12,
  },
  previewPlaceholderText: {
    color: "rgba(255,255,255,0.65)",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  errorText: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  retryBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
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
  zoomChipText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
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
