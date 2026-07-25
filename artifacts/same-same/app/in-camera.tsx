// Full-screen in-app camera with a Ripple frame guide overlay. The live
// preview is clipped to the white box (same width, height, and aspect ratio
// as one photo pane on the match swipe card). Capture crops the viewport
// so the saved photo matches what you see inside the box.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useApp } from "@/context/AppContext";
import { getTodaysChallenge } from "@/data/samplePhotos";
import { suggestGenre, type MusicGenre } from "@/data/musicLibrary";
import {
  isLegacyHomeRippleStart,
  isRippleNavFixEnabled,
  resolvePostCaptureComposeHref,
} from "@/utils/rippleNavigation";
import {
  computeRipplePhotoViewportCrop,
  getRipplePhotoGuideRect,
} from "@/constants/ripplePhotoFrame";
import { setPendingCapture } from "@/utils/captureBus";
import { detectCountryFromGPS } from "@/utils/gpsCountry";
import { requestAtlasRefresh } from "@/utils/atlasHub";
import {
  acquireCameraSession,
  releaseCameraSession,
} from "@/utils/cameraSession";
import { recordCameraEvent } from "@/utils/cameraTelemetry";
import {
  beginCaptureTransition,
  CAPTURE_FAST_MATCH,
  endCaptureTransition,
  nextCaptureRequestId,
  recordCaptureTransitionEvent,
  registerCaptureDisplayUri,
  startBackgroundPhotoUpload,
  writeCaptureThumbnail,
} from "@/utils/captureTransition";

const CAMERA_OWNER_ID = "in-camera";
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PINCH_SCALE_FACTOR = 0.25;
const MAX_MOUNT_RETRIES = 2;
const PREVIEW_READY_TIMEOUT_MS = 1200;
const GUIDE_DIM = "rgba(0,0,0,0.42)";
const GUIDE_BORDER = "rgba(255,255,255,0.92)";
const MAX_HOME_TAGS = 4;

function normalizeTheme(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 \-']/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
}

function defaultQuickRipplePost(myVibe: string[]): {
  theme: string;
  tags: string[];
  musicGenre: MusicGenre;
} {
  const challenge = getTodaysChallenge();
  const theme = normalizeTheme(challenge.title) || "today";
  const tags = myVibe.slice(0, MAX_HOME_TAGS);
  const musicGenre = suggestGenre(theme, tags);
  return { theme, tags, musicGenre };
}

function RippleFrameGuide({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.guideDim, { top: 0, left: 0, right: 0, height: top }]} />
      <View
        style={[
          styles.guideDim,
          { top: top + height, left: 0, right: 0, bottom: 0 },
        ]}
      />
      <View
        style={[styles.guideDim, { top, left: 0, width: left, height }]}
      />
      <View
        style={[
          styles.guideDim,
          { top, left: left + width, right: 0, height },
        ]}
      />
      <View
        style={[
          styles.guideBox,
          { left, top, width, height },
        ]}
      />
    </View>
  );
}

export default function InCameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    addMyPhoto,
    setMyPhotoBackendId,
    setMyPhotoUploadState,
    myCountryCode,
    myVibe,
  } = useApp();
  const { from, intent, flow } = useLocalSearchParams<{
    from?: string;
    intent?: string;
    flow?: string;
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

  const frameInsets = useMemo(
    () => ({ top: insets.top, bottom: insets.bottom }),
    [insets.top, insets.bottom],
  );
  const guideRect = useMemo(
    () => getRipplePhotoGuideRect(frameInsets),
    [frameInsets],
  );

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
    const captureStarted = Date.now();
    const requestId = nextCaptureRequestId();
    beginCaptureTransition(requestId);
    recordCameraEvent("camera.capture.start");
    recordCaptureTransitionEvent("capture.time", { requestId, start: captureStarted });
    try {
      const shot = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
        exif: false,
      });
      if (!shot?.uri) return;

      const w = shot.width ?? 0;
      const h = shot.height ?? 0;
      const crop = computeRipplePhotoViewportCrop(w, h, guideRect, {
        mirrorX: facing === "front",
      });
      const cropped = await ImageManipulator.manipulateAsync(
        shot.uri,
        [{ crop }],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        },
      );
      if (!cropped.uri) return;

      const displayUri = cropped.uri;
      registerCaptureDisplayUri(displayUri, requestId);
      const capturedAt = new Date().toISOString();
      recordCameraEvent("camera.capture.success");

      if (
        !isRippleNavFixEnabled() &&
        isLegacyHomeRippleStart(from) &&
        CAPTURE_FAST_MATCH
      ) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
        const { theme, tags, musicGenre } = defaultQuickRipplePost(myVibe);
        const homeFallbackCc =
          typeof myCountryCode === "string" && myCountryCode.length === 2
            ? myCountryCode.toUpperCase()
            : undefined;
        const uploadLocalId = addMyPhoto(
          displayUri,
          theme,
          tags,
          false,
          musicGenre,
          undefined,
          [],
          homeFallbackCc,
          myCountryCode,
          capturedAt,
        );
        recordCaptureTransitionEvent("navigate.to.match.start", { requestId });
        router.replace("/(tabs)/match");
        recordCaptureTransitionEvent("navigate.to.match.complete", {
          requestId,
          ms: Date.now() - captureStarted,
        });
        void writeCaptureThumbnail(displayUri, requestId);
        void (async () => {
          const detected = await Promise.race([
            detectCountryFromGPS(),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 800)),
          ]);
          startBackgroundPhotoUpload(
            {
              requestId,
              localUri: displayUri,
              localId: uploadLocalId,
              theme,
              tags,
              musicGenre,
              capturedAt,
              myCountryCode,
              captureCountryCode: detected?.code ?? homeFallbackCc,
            },
            {
              setMyPhotoBackendId,
              setMyPhotoUploadState,
              requestAtlasRefresh,
            },
          );
        })();
        return;
      }

      let thumbnailUri = displayUri;
      if (CAPTURE_FAST_MATCH) {
        thumbnailUri = await writeCaptureThumbnail(displayUri, requestId);
      }

      setPendingCapture({
        uri: displayUri,
        thumbnailUri,
        mimeType: "image/jpeg",
        capturedAt,
        requestId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      const composeHref = resolvePostCaptureComposeHref({ flow, intent, from });
      if (composeHref) {
        router.replace(composeHref);
      } else {
        router.back();
      }
    } catch (err) {
      recordCameraEvent("camera.capture.failure", {
        reason: err instanceof Error ? err.message : "unknown",
      });
      recordCaptureTransitionEvent("cache.write.failure", { requestId });
      Alert.alert("Couldn't capture photo", "Please try again.");
    } finally {
      endCaptureTransition();
      setBusy(false);
    }
  };

  const topPadding = Platform.OS === "web" ? 24 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom;

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
      <View style={styles.container}>
        {cameraLive && !mountError ? (
          <PinchGestureHandler
            onGestureEvent={onPinch}
            onHandlerStateChange={onPinchStateChange}
          >
            <View
              style={[
                styles.guideViewport,
                {
                  left: guideRect.left,
                  top: guideRect.top,
                  width: guideRect.width,
                  height: guideRect.height,
                },
              ]}
            >
              <CameraView
                key={`cam-${facing}-${remountNonce}`}
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                zoom={zoom}
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

        {previewReady ? (
          <RippleFrameGuide
            left={guideRect.left}
            top={guideRect.top}
            width={guideRect.width}
            height={guideRect.height}
          />
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

        <View style={[styles.header, { paddingTop: topPadding }]}>
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
          style={[styles.controls, { paddingBottom: bottomPadding + 20 }]}
          onLayout={() => {
            recordCameraEvent("camera.surface.ready", {
              w: SCREEN_WIDTH,
              h: SCREEN_HEIGHT,
              guideW: guideRect.width,
              guideH: guideRect.height,
            });
          }}
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
            What you see in the box is your Ripple photo
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  guideViewport: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  guideDim: {
    position: "absolute",
    backgroundColor: GUIDE_DIM,
  },
  guideBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: GUIDE_BORDER,
    borderRadius: 2,
  },
  previewPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,17,17,0.72)",
    paddingHorizontal: 24,
    gap: 12,
    zIndex: 5,
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
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 10,
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
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 16,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
