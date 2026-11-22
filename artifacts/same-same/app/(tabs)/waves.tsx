import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { PhotoMetaChip } from "@/components/PhotoMetaChip";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { isPreviewOfferId, withOptionalSampleOffers } from "@/core/sampleOffers";
import type { Offer, Wave } from "@/core/types";
import { waveListPlace, waveListWhen } from "@/core/waveListMeta";
import { emotionFor } from "@/data/emotions";
import { topicFor } from "@/data/topics";
import { sceneFor } from "@/data/scenes";
import { errorKind } from "@/backend/types";
import { useAppState } from "@/state/AppState";
import { useTabBarClearance } from "@/state/TabBarHeight";
import { colors, space } from "@/theme";

/**
 * Waves tab: inbox of incoming Ripples (Wave back / Dismiss) plus mutual Wave history.
 * Map of past Waves lives on the Map tab.
 */
export default function WavesScreen() {
  const router = useRouter();
  const {
    offers,
    offersKnown,
    waves,
    wavesKnown,
    sync,
    respondToOffer,
    syncNow,
  } = useAppState();
  const tabClearance = useTabBarClearance(space.md);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Local preview dismissals so Maestro can exercise Dismiss without a server. */
  const [hiddenPreviewIds, setHiddenPreviewIds] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      void syncNow({ force: true });
    }, [syncNow]),
  );

  const inbox = useMemo(() => {
    const live = withOptionalSampleOffers(offers).filter(
      (o) => !hiddenPreviewIds.includes(o.id),
    );
    return live;
  }, [offers, hiddenPreviewIds]);

  const history = useMemo(() => waves, [waves]);
  const loading = !offersKnown && sync === "syncing";

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  };

  const onWaveBack = async (offer: Offer) => {
    if (busyId) return;
    setBusyId(offer.id);
    try {
      if (isPreviewOfferId(offer.id)) {
        setHiddenPreviewIds((ids) => [...ids, offer.id]);
        flash("Wave formed (preview).");
        return;
      }
      await respondToOffer(offer.id, "same");
      flash("You waved back.");
    } catch (error) {
      flash(
        errorKind(error) === "unreachable"
          ? "Can't reach SameWave. Try again."
          : "That Wave couldn't be sent. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const onDismiss = async (offer: Offer) => {
    if (busyId) return;
    setBusyId(offer.id);
    try {
      if (isPreviewOfferId(offer.id)) {
        setHiddenPreviewIds((ids) => [...ids, offer.id]);
        return;
      }
      await respondToOffer(offer.id, "different");
    } catch (error) {
      flash(
        errorKind(error) === "unreachable"
          ? "Can't reach SameWave. Try again."
          : "That couldn't be dismissed. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const openWave = (wave: Wave) => {
    router.push({ pathname: "/wave/[id]", params: { id: wave.id } });
  };

  return (
    <Screen
      scene={sceneFor.home}
      scroll
      reserveBottom={tabClearance}
      style={styles.screen}
    >
      <Txt variant="title" style={styles.heading} accessibilityLabel="Waves">
        Waves
      </Txt>

      {toast ? (
        <Frost kind="card" style={styles.toast} contentStyle={styles.toastPad}>
          <Txt tone="secondary" center>
            {toast}
          </Txt>
        </Frost>
      ) : null}

      <Txt variant="heading" style={styles.section}>
        Inbox
      </Txt>

      {loading ? (
        <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
          <ActivityIndicator color={colors.waterMid} />
          <Txt tone="secondary" center style={styles.emptyBody}>
            Checking for Ripples…
          </Txt>
        </Frost>
      ) : inbox.length === 0 ? (
        <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
          <Txt tone="secondary" center>
            No incoming Ripples
          </Txt>
          <Txt variant="quiet" tone="quiet" center style={styles.emptyBody}>
            When someone waves at one of your photos, it lands here for you to
            Wave back or Dismiss.
          </Txt>
        </Frost>
      ) : (
        inbox.map((offer) => (
          <InboxRow
            key={offer.id}
            offer={offer}
            busy={busyId === offer.id}
            onWaveBack={() => void onWaveBack(offer)}
            onDismiss={() => void onDismiss(offer)}
          />
        ))
      )}

      <Txt variant="heading" style={styles.section}>
        Your Waves
      </Txt>

      {!wavesKnown && sync === "syncing" ? (
        <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
          <ActivityIndicator color={colors.waterMid} />
        </Frost>
      ) : history.length === 0 ? (
        <Frost kind="card" style={styles.card} contentStyle={styles.emptyPad}>
          <Txt tone="secondary" center>
            No Waves yet
          </Txt>
          <Txt variant="quiet" tone="quiet" center style={styles.emptyBody}>
            Mutual Waves stay here. The map of where they happened is on the Map
            tab.
          </Txt>
        </Frost>
      ) : (
        history.map((wave) => (
          <Pressable
            key={wave.id}
            onPress={() => openWave(wave)}
            accessibilityRole="button"
            accessibilityLabel="Open Wave"
            style={styles.historyHit}
          >
            <Frost kind="card" style={styles.card} contentStyle={styles.historyPad}>
              <View style={styles.historyRow}>
                {wave.theirs.uri ? (
                  <Image
                    source={{ uri: wave.theirs.uri }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <View style={styles.historyMeta}>
                  <Txt numberOfLines={1}>
                    {waveListPlace({
                      countryCode: wave.theirs.countryCode,
                      countrySource: wave.theirs.countrySource,
                    })}
                  </Txt>
                  <Txt variant="quiet" tone="quiet" numberOfLines={1}>
                    {waveListWhen(wave.formedAt) ?? "Wave"}
                  </Txt>
                </View>
              </View>
            </Frost>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function InboxRow({
  offer,
  busy,
  onWaveBack,
  onDismiss,
}: {
  offer: Offer;
  busy: boolean;
  onWaveBack: () => void;
  onDismiss: () => void;
}) {
  const feeling = emotionFor(offer.theirEmotion)?.label ?? null;
  const topic = topicFor(offer.theirTopic)?.label ?? offer.theirTopic;
  const place = waveListPlace({ countryCode: offer.theirCountryCode });
  const when = waveListWhen(offer.createdAt);

  return (
    <Frost kind="card" style={styles.card} contentStyle={styles.inboxPad}>
      <View style={styles.inboxTop}>
        {offer.theirUri ? (
          <Image
            source={{ uri: offer.theirUri }}
            style={styles.thumb}
            contentFit="cover"
            accessibilityLabel="Their photo"
          />
        ) : (
          <View
            style={[styles.thumb, styles.thumbEmpty]}
            accessibilityLabel="Their photo"
          />
        )}
        <View style={styles.inboxMeta}>
          <PhotoMetaChip emotion={offer.theirEmotion} topic={offer.theirTopic} />
          {!feeling && !topic ? (
            <Txt variant="quiet" tone="quiet">
              Incoming Ripple
            </Txt>
          ) : null}
          <Txt variant="quiet" tone="secondary" numberOfLines={1}>
            {[place, when].filter(Boolean).join(" · ")}
          </Txt>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Wave back"
          onPress={onWaveBack}
          busy={busy}
          disabled={busy}
          style={styles.actionBtn}
          accessibilityHint="Forms a mutual Wave"
        />
        <Button
          kind="soft"
          label="Dismiss"
          onPress={onDismiss}
          disabled={busy}
          style={styles.actionBtn}
          accessibilityHint="Removes this Ripple from your inbox"
        />
      </View>
    </Frost>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: "flex-start" },
  heading: { marginBottom: space.md },
  section: { marginTop: space.lg, marginBottom: space.sm },
  card: { marginBottom: space.md },
  emptyPad: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    gap: space.sm,
    alignItems: "center",
  },
  emptyBody: { maxWidth: 300 },
  toast: { marginBottom: space.md },
  toastPad: { paddingHorizontal: space.md, paddingVertical: space.sm },
  inboxPad: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.md,
  },
  inboxTop: { flexDirection: "row", gap: space.md, alignItems: "center" },
  inboxMeta: { flex: 1, gap: space.xs, minWidth: 0 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  thumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  actions: { flexDirection: "row", gap: space.sm },
  actionBtn: { flex: 1, alignSelf: "stretch" },
  historyHit: { alignSelf: "stretch" },
  historyPad: { paddingHorizontal: space.md, paddingVertical: space.md },
  historyRow: { flexDirection: "row", gap: space.md, alignItems: "center" },
  historyMeta: { flex: 1, minWidth: 0, gap: space.xs },
});
