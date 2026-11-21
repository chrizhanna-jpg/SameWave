import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { chooseFromLibrary } from "@/device/photos";
import { setDraftPhoto } from "@/state/draft";
import { colors, layout, radius, space } from "@/theme";

/** Some phones never report that the camera is ready; after this long it is treated as ready. */
const READY_FALLBACK_MS = 1200;
const MAX_RESTARTS = 2;

export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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

  useFocusEffect(
    useCallback(() => {
      setLive(true);
      setRestarts(0);
      setProblem(null);
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
      setDraftPhoto({
        uri: shot.uri,
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

  if (!permission) {
    return <Screen>{null}</Screen>;
  }

  if (!permission.granted) {
    return (
      <Screen style={styles.ask}>
        <Header icon="close" />
        <View style={styles.askCentre}>
          <Txt variant="title" center>
            Take today's photo
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

  // The frame has the camera's own 3:4 shape, so what is seen is what is sent.
  const frameHeight = Math.min(Math.round((width * 4) / 3), room ?? Infinity);
  const frameWidth = Math.round((frameHeight * 3) / 4);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Header icon="close" />
      </View>

      <View style={styles.middle} onLayout={(event) => setRoom(event.nativeEvent.layout.height)}>
        <View style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
          {live ? (
            <CameraView
              key={`${facing}-${restarts}`}
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing={facing}
              onCameraReady={() => setReady(true)}
              onMountError={() => {
                if (restarts < MAX_RESTARTS) setRestarts((n) => n + 1);
                else setProblem("The camera wouldn't start. You can choose a photo instead.");
              }}
            />
          ) : null}
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
          onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
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
  frame: { backgroundColor: colors.background, borderRadius: radius.lg, overflow: "hidden" },
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
