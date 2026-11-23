import * as ExpoLinking from "expo-linking";
import { useFocusEffect } from "expo-router";
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";

import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { Header } from "@/components/Header";
import { MusicCreditsExpand } from "@/components/MusicCreditsExpand";
import { Photo } from "@/components/Photo";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { apiOrigin, appVersionLabel, LEGAL_LINKS } from "@/config/env";
import { flagFor, nameFor } from "@/data/countries";
import { sceneFor } from "@/data/scenes";
import {
  cancelScheduledLocalNotifications,
  enablePushes,
  pushPermission,
  remotePushUnavailable,
  scheduleLocalWaveNotification,
  type PushPermission,
} from "@/device/push";
import {
  readNotificationsEnabled,
  writeNotificationsEnabled,
} from "@/device/notificationPrefs";
import { readSamplePhotosToggle, testPhotosBuildEnabled } from "@/core/testPhotos";
import { useAppState } from "@/state/AppState";
import { useSession } from "@/state/session";
import { colors, radius, space } from "@/theme";

/** Preview-only Account row — Metro stubs the module when test photos are off. */
function SamplePhotosAccountRow(props: {
  on: boolean;
  setOn: (next: boolean) => void;
}) {
  if (process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SamplePhotosToggleRow } = require("../assets/test-photos/SamplePhotosToggleRow") as {
    SamplePhotosToggleRow: React.ComponentType<{
      on: boolean;
      setOn: (next: boolean) => void;
    }>;
  };
  return <SamplePhotosToggleRow {...props} />;
}

/** Preview / __DEV__ link to the location diagnostic (stubbed in production exports). */
function LocationDiagAccountRow() {
  if (!__DEV__ && process.env.EXPO_PUBLIC_TEST_PHOTOS !== "1") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../assets/test-photos/LocationDiagAccountRow") as {
    LocationDiagAccountRow?: React.ComponentType | null;
  };
  const Row = mod.LocationDiagAccountRow;
  return Row ? <Row /> : null;
}

/** Quiet place for country, history, notifications, legal, and sign out. */
export default function AccountScreen() {
  const router = useRouter();
  const session = useSession();
  const {
    countryCode,
    history,
    waves,
    deletePhoto,
    askForPushes,
    shouldAskForPushes,
    backend,
  } = useAppState();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [inAppOn, setInAppOn] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testPushBusy, setTestPushBusy] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [samplePhotos, setSamplePhotos] = useState(false);
  const samplesAvailable = testPhotosBuildEnabled();

  const refreshNotificationState = useCallback(async () => {
    const [perm, enabled] = await Promise.all([
      pushPermission(),
      readNotificationsEnabled(),
    ]);
    setPermission(perm);
    setInAppOn(enabled);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshNotificationState();
    }, [refreshNotificationState]),
  );

  React.useEffect(() => {
    if (!samplesAvailable) return;
    void readSamplePhotosToggle().then(setSamplePhotos);
  }, [samplesAvailable]);

  const onDelete = (photoId: string) => {
    Alert.alert("Delete this Ripple?", "It leaves your history on this phone and the server.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setBusyId(photoId);
          void deletePhoto(photoId)
            .catch(() => {
              Alert.alert(
                "Couldn't delete",
                "Try again in a moment. If the photo already looks blank, it may already be gone on the server.",
              );
            })
            .finally(() => setBusyId(null));
        },
      },
    ]);
  };

  const notificationsLabel = () => {
    if (!inAppOn) return "Off";
    if (permission === "unsupported") return "On — not available on this device";
    if (permission === "granted") return "On";
    if (permission === "denied") return "On — open Settings to allow";
    return shouldAskForPushes ? "On — ask after your next Ripple" : "On — tap to allow";
  };

  const setNotifications = async (next: boolean) => {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      await writeNotificationsEnabled(next);
      setInAppOn(next);
      if (!next) {
        await cancelScheduledLocalNotifications();
        const address = await enablePushes({ ask: false });
        if (address) {
          await backend.unregisterPushToken(address).catch(() => undefined);
        }
      } else if (permission === "granted") {
        const address = await enablePushes({ ask: false });
        if (address) {
          await backend
            .registerPushToken(address, Platform.OS === "ios" ? "ios" : "android")
            .catch(() => undefined);
        }
      } else if (permission === "undetermined") {
        const nextPerm = await askForPushes();
        setPermission(nextPerm);
      } else if (permission === "denied") {
        void Linking.openSettings();
      }
      await refreshNotificationState();
    } finally {
      setNotifBusy(false);
    }
  };

  return (
    <Screen scroll scene={sceneFor.account}>
      <Header />
      <Frost kind="card" style={styles.card} contentStyle={styles.cardPad}>
        <Txt variant="title">Account</Txt>

        <Txt variant="heading" style={styles.sectionFirst}>
          Your Ripples
        </Txt>
        {history.length === 0 ? (
          <Txt tone="secondary" style={styles.empty}>
            Photos you send will live here.
          </Txt>
        ) : (
          <View style={styles.grid}>
            {history.map((photo) => {
              const paired = waves.find(
                (w) => w.mine.photoId === photo.photoId || w.theirs.photoId === photo.photoId,
              );
              return (
                <Pressable
                  key={photo.photoId}
                  onPress={() => {
                    if (paired) {
                      router.push({ pathname: "/wave/[id]", params: { id: paired.id } });
                    }
                  }}
                  onLongPress={() => onDelete(photo.photoId)}
                  accessibilityLabel={
                    paired
                      ? "Ripple with a Wave. Tap to open the pair. Long press to delete."
                      : "Ripple. Long press to delete."
                  }
                  style={styles.tile}
                >
                  <Photo
                    uri={photo.uri}
                    ownPhotoId={photo.photoId}
                    onUnavailable={() => {
                      /* Unavailable label is enough; long-press still deletes. */
                    }}
                    style={styles.tilePhoto}
                  />
                  {busyId === photo.photoId ? (
                    <View style={styles.tileBusy}>
                      <Txt variant="quiet" tone="primary">
                        …
                      </Txt>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
        {history.length > 0 ? (
          <Txt variant="quiet" tone="secondary" style={styles.hint}>
            Long press a photo to delete it. Tap one with a Wave to open the pair.
          </Txt>
        ) : null}

        <Txt variant="heading" style={styles.section}>
          Your Waves
        </Txt>
        {waves.length === 0 ? (
          <Txt tone="secondary" style={styles.empty}>
            When a Ripple finds a match, the pair lives here.
          </Txt>
        ) : (
          <View style={styles.waveList}>
            {waves.map((wave) => (
              <Pressable
                key={wave.id}
                onPress={() => router.push({ pathname: "/wave/[id]", params: { id: wave.id } })}
                accessibilityRole="button"
                accessibilityLabel="Open Wave pair"
                style={styles.waveRow}
              >
                <View style={styles.waveThumbs}>
                  <Photo
                    uri={wave.mine.uri}
                    ownPhotoId={wave.mine.photoId}
                    style={styles.waveThumb}
                  />
                  <Photo uri={wave.theirs.uri} style={styles.waveThumb} />
                </View>
                <Txt tone="secondary" style={styles.waveOpen}>
                  Open
                </Txt>
              </Pressable>
            ))}
          </View>
        )}
      </Frost>

      <Frost kind="card" style={styles.card} contentStyle={styles.cardPad}>
        <Pressable
          onPress={() => router.push("/change-country")}
          accessibilityRole="button"
          accessibilityLabel="Change country"
          style={styles.row}
        >
          <View style={styles.fill}>
            <Txt variant="quiet" tone="secondary">
              Country
            </Txt>
            <Txt>
              {flagFor(countryCode)} {nameFor(countryCode) ?? "Choose"}
            </Txt>
          </View>
          <Txt tone="secondary">Change</Txt>
        </Pressable>

        <Pressable
          onPress={() => router.push("/how-it-works")}
          accessibilityRole="button"
          style={styles.row}
        >
          <Txt>How it works</Txt>
        </Pressable>

        <View style={styles.row}>
          <View style={styles.fill}>
            <Txt variant="quiet" tone="secondary">
              Notifications
            </Txt>
            <Txt>{notificationsLabel()}</Txt>
          </View>
          <Button
            kind="quiet"
            label={notifBusy ? "…" : inAppOn ? "Turn off" : "Turn on"}
            busy={notifBusy}
            onPress={() => void setNotifications(!inAppOn)}
          />
        </View>

        {samplesAvailable ? <SamplePhotosAccountRow on={samplePhotos} setOn={setSamplePhotos} /> : null}
        {__DEV__ || samplesAvailable ? <LocationDiagAccountRow /> : null}

        {/* Expo Go cannot receive remote push — local schedule tests tap → reveal. */}
        <View style={styles.row}>
          <View style={styles.fill}>
            <Txt variant="quiet" tone="secondary">
              Preview Wave tap
            </Txt>
            <Txt>
              {remotePushUnavailable
                ? "Local notification (Expo Go)"
                : "Local notification (test routing)"}
            </Txt>
          </View>
          <Button
            kind="quiet"
            label={testPushBusy ? "…" : "Try"}
            busy={testPushBusy}
            onPress={() => {
              if (!inAppOn) {
                Alert.alert("Notifications are Off", "Turn them on in Account first.");
                return;
              }
              const sample = waves[0];
              if (!sample) {
                Alert.alert(
                  "No Wave yet",
                  "Open or form a Wave first, then try again so the tap has somewhere to go.",
                );
                return;
              }
              setTestPushBusy(true);
              void scheduleLocalWaveNotification({
                waveId: sample.id,
                delaySeconds: 3,
                allowed: inAppOn,
              })
                .then((id) => {
                  if (!id) {
                    Alert.alert(
                      "Couldn't schedule",
                      "Allow notifications for SameWave, then try again.",
                    );
                    return;
                  }
                  Alert.alert(
                    "Notification in ~3s",
                    "Background the app (or stay here), then tap the notification to open the Wave reveal.",
                  );
                })
                .finally(() => setTestPushBusy(false));
            }}
          />
        </View>

        <View style={styles.legal}>
          <Button
            kind="quiet"
            label="Privacy"
            onPress={() => void ExpoLinking.openURL(apiOrigin() + LEGAL_LINKS.privacy)}
          />
          <Button
            kind="quiet"
            label="Terms"
            onPress={() => void ExpoLinking.openURL(apiOrigin() + LEGAL_LINKS.terms)}
          />
          <Button
            kind="quiet"
            label="Data deletion"
            onPress={() => void ExpoLinking.openURL(apiOrigin() + LEGAL_LINKS.deletion)}
          />
        </View>

        <MusicCreditsExpand />
        <Txt variant="quiet" tone="secondary" center>
          {appVersionLabel()}
        </Txt>
        <Txt variant="quiet" tone="secondary" center style={styles.copyright}>
          © 2026 SameWave Studios. All rights reserved.
        </Txt>

        <Button
          kind="soft"
          label="Sign out"
          onPress={() => void session.signOut()}
          style={styles.signOut}
        />
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { marginBottom: space.md },
  cardPad: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  sectionFirst: { marginTop: space.lg },
  section: { marginTop: space.xl },
  empty: { marginTop: space.md },
  grid: {
    marginTop: space.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  tile: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  tilePhoto: { width: "100%", height: "100%" },
  tileBusy: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { marginTop: space.sm },
  waveList: { marginTop: space.md, gap: space.sm },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
  },
  waveThumbs: { flexDirection: "row", gap: space.xs },
  waveThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  waveOpen: { marginLeft: "auto" },
  legal: {
    marginTop: space.xl,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: space.sm,
  },
  copyright: { marginTop: space.sm },
  signOut: { marginTop: space.xl, marginBottom: space.sm },
});
