import * as ExpoLinking from "expo-linking";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import React, { useState } from "react";

import { Button } from "@/components/Button";
import { Header } from "@/components/Header";
import { Photo } from "@/components/Photo";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { apiOrigin, appVersionLabel, LEGAL_LINKS } from "@/config/env";
import { flagFor, nameFor } from "@/data/countries";
import { MUSIC_CREDIT } from "@/data/vibes";
import { enablePushes, pushPermission, type PushPermission } from "@/device/push";
import { useAppState } from "@/state/AppState";
import { useSession } from "@/state/session";
import { colors, radius, space } from "@/theme";

/** Quiet place for country, history, notifications, legal, and sign out. */
export default function AccountScreen() {
  const router = useRouter();
  const session = useSession();
  const {
    countryCode,
    history,
    deletePhoto,
    askForPushes,
    shouldAskForPushes,
  } = useAppState();
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  React.useEffect(() => {
    void pushPermission().then(setPermission);
  }, []);

  const onDelete = (photoId: string) => {
    Alert.alert("Delete this Ripple?", "It leaves your history on this phone and the server.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setBusyId(photoId);
          void deletePhoto(photoId)
            .catch(() => undefined)
            .finally(() => setBusyId(null));
        },
      },
    ]);
  };

  const notificationsLabel = () => {
    if (permission === "unsupported") return "Not available here";
    if (permission === "granted") return "On";
    if (permission === "denied") return "Off — open Settings to change";
    return shouldAskForPushes ? "Ask after your next Ripple" : "Tap to turn on";
  };

  return (
    <Screen scroll>
      <Header />
      <Txt variant="title">Account</Txt>

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
        {permission === "undetermined" || permission === "denied" ? (
          <Button
            kind="quiet"
            label={permission === "denied" ? "Settings" : "Turn on"}
            onPress={() => {
              if (permission === "denied") {
                void Linking.openSettings();
                return;
              }
              void askForPushes().then(setPermission);
            }}
          />
        ) : permission === "granted" ? (
          <Button
            kind="quiet"
            label="Refresh"
            onPress={() => void enablePushes({ ask: false }).then(() => pushPermission().then(setPermission))}
          />
        ) : null}
      </View>

      <Txt variant="heading" style={styles.section}>
        Your Ripples
      </Txt>
      {history.length === 0 ? (
        <Txt tone="secondary" style={styles.empty}>
          Photos you send will live here.
        </Txt>
      ) : (
        <View style={styles.grid}>
          {history.map((photo) => (
            <Pressable
              key={photo.photoId}
              onLongPress={() => onDelete(photo.photoId)}
              accessibilityLabel="Ripple. Long press to delete."
              style={styles.tile}
            >
              <Photo
                uri={photo.uri}
                ownPhotoId={photo.uri ? undefined : photo.photoId}
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
          ))}
        </View>
      )}
      {history.length > 0 ? (
        <Txt variant="quiet" tone="secondary" style={styles.hint}>
          Long press a photo to delete it.
        </Txt>
      ) : null}

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

      <Txt variant="quiet" tone="secondary" center style={styles.credit}>
        {MUSIC_CREDIT}
      </Txt>
      <Txt variant="quiet" tone="secondary" center>
        {appVersionLabel()}
      </Txt>

      <Button
        kind="soft"
        label="Sign out"
        onPress={() => void session.signOut()}
        style={styles.signOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  section: { marginTop: space.xxl },
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
  legal: {
    marginTop: space.xxl,
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: space.sm,
  },
  credit: { marginTop: space.lg },
  signOut: { marginTop: space.xl, marginBottom: space.xxl },
});
